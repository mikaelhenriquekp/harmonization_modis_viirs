package firms

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// DefaultBaseURL is the FIRMS server.
const DefaultBaseURL = "https://firms.modaps.eosdis.nasa.gov"

// MaxDays is the longest window the area API accepts per request.
const MaxDays = 5

// ErrNotFound means the archive has no such file.
var ErrNotFound = errors.New("firms: not found")

// Client talks to FIRMS.
type Client struct {
	BaseURL   string
	MapKey    string
	HTTP      *http.Client
	Retries   int
	RetryWait time.Duration
}

// NewClient builds a client. The key is only needed for the area API.
func NewClient(mapKey string) *Client {
	return &Client{
		BaseURL: DefaultBaseURL,
		MapKey:  mapKey,
		HTTP: &http.Client{Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			DialContext:           (&net.Dialer{Timeout: 30 * time.Second}).DialContext,
			ResponseHeaderTimeout: 2 * time.Minute,
			MaxIdleConnsPerHost:   8,
		}},
		Retries:   4,
		RetryWait: 2 * time.Second,
	}
}

// get fetches a path and hands the body to read, retrying network and server
// errors with exponential backoff.
func (c *Client) get(ctx context.Context, path string, read func(io.Reader) error) error {
	var last error
	for attempt := 0; attempt <= c.Retries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(c.RetryWait << (attempt - 1)):
			}
		}
		retry, err := c.try(ctx, path, read)
		if err == nil || !retry {
			return err
		}
		last = err
	}
	return last
}

func (c *Client) try(ctx context.Context, path string, read func(io.Reader) error) (retry bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return false, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return ctx.Err() == nil, fmt.Errorf("get %s: %w", redact(path), err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return false, fmt.Errorf("%w: %s", ErrNotFound, redact(path))
	case resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests:
		return true, fmt.Errorf("get %s: status %d", redact(path), resp.StatusCode)
	case resp.StatusCode >= 400:
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return false, fmt.Errorf("%w: %s (status %d)", ErrAPI, strings.TrimSpace(string(msg)), resp.StatusCode)
	}
	if err := read(resp.Body); err != nil {
		var netErr net.Error
		if errors.As(err, &netErr) || errors.Is(err, io.ErrUnexpectedEOF) {
			return ctx.Err() == nil, err
		}
		return false, err
	}
	return false, nil
}

// redact keeps the MAP_KEY out of errors and logs.
func redact(path string) string {
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if i > 0 && (parts[i-1] == "csv") && len(p) == 32 {
			parts[i] = "***"
		}
	}
	return strings.Join(parts, "/")
}

// Index downloads the list of archive files.
func (c *Client) Index(ctx context.Context) (Index, error) {
	var idx Index
	err := c.get(ctx, "/data/country/yearly_summary_files.txt", func(r io.Reader) error {
		var err error
		idx, err = ParseIndex(r)
		return err
	})
	return idx, err
}

// CountryFile streams one yearly archive file.
func (c *Client) CountryFile(ctx context.Context, product string, year int, country string, fn func(harmonize.Detection) error) error {
	path := fmt.Sprintf("/data/country/%s/%d/%s", product, year, FileName(product, year, country))
	return c.get(ctx, path, func(r io.Reader) error { return ParseCSV(r, fn) })
}

// Window is one area API request: start day and number of days (1..5).
type Window struct {
	Start time.Time
	Days  int
}

func (w Window) String() string { return fmt.Sprintf("{%s %d}", w.Start.Format(time.DateOnly), w.Days) }

// Windows splits [from, to] into windows of at most MaxDays days.
func Windows(from, to time.Time) []Window {
	var out []Window
	for d := from; !d.After(to); {
		n := min(MaxDays, int(to.Sub(d).Hours()/24)+1)
		out = append(out, Window{Start: d, Days: n})
		d = d.AddDate(0, 0, n)
	}
	return out
}

// Area fetches one window of a source ("VIIRS_SNPP_SP", "VIIRS_NOAA20_NRT",
// "MODIS_SP"...) for an area ("west,south,east,north" or "world").
func (c *Client) Area(ctx context.Context, source, area string, w Window, fn func(harmonize.Detection) error) error {
	path := fmt.Sprintf("/api/area/csv/%s/%s/%s/%d/%s", c.MapKey, source, area, w.Days, w.Start.Format(time.DateOnly))
	return c.get(ctx, path, func(r io.Reader) error { return ParseCSV(r, fn) })
}

// AreaRange fetches [from, to] window by window and only passes on detections
// dated inside the range.
func (c *Client) AreaRange(ctx context.Context, source, area string, from, to time.Time, fn func(harmonize.Detection) error) error {
	lo, hi := from.Format(time.DateOnly), to.Format(time.DateOnly)
	for _, w := range Windows(from, to) {
		err := c.Area(ctx, source, area, w, func(d harmonize.Detection) error {
			if d.Date < lo || d.Date > hi {
				return nil
			}
			return fn(d)
		})
		if err != nil {
			return fmt.Errorf("%s %s: %w", source, w, err)
		}
	}
	return nil
}

// DateRange is the period a source covers.
type DateRange struct {
	Min, Max time.Time
}

// Availability returns the date range of every source.
func (c *Client) Availability(ctx context.Context) (map[string]DateRange, error) {
	out := map[string]DateRange{}
	err := c.get(ctx, "/api/data_availability/csv/"+c.MapKey+"/all", func(r io.Reader) error {
		rows, err := csv.NewReader(r).ReadAll()
		if err != nil {
			return fmt.Errorf("%w: %w", ErrAPI, err)
		}
		if len(rows) == 0 || rows[0][0] != "data_id" {
			return fmt.Errorf("%w: unexpected availability format", ErrAPI)
		}
		for _, row := range rows[1:] {
			if len(row) < 3 {
				continue
			}
			a, err1 := time.Parse(time.DateOnly, row[1])
			b, err2 := time.Parse(time.DateOnly, row[2])
			if err1 == nil && err2 == nil {
				out[row[0]] = DateRange{Min: a, Max: b}
			}
		}
		return nil
	})
	return out, err
}
