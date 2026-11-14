// Package firms reads NASA FIRMS active fire data: the yearly archive by
// country (no key needed) and the area API (needs a MAP_KEY).
package firms

import (
	"bufio"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"

	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// ErrAPI means FIRMS answered with a message instead of data.
var ErrAPI = errors.New("firms api error")

// ParseCSV streams a FIRMS CSV (archive, standard or near real time) and calls
// fn for every detection. Columns are found by name; "type" is optional.
func ParseCSV(r io.Reader, fn func(harmonize.Detection) error) error {
	br := bufio.NewReaderSize(r, 1<<16)
	head, err := br.Peek(8)
	if len(head) == 0 {
		return fmt.Errorf("%w: empty response", ErrAPI)
	}
	if !strings.HasPrefix(string(head), "latitude") {
		msg, _ := br.ReadString('\n')
		return fmt.Errorf("%w: %s", ErrAPI, strings.TrimSpace(msg))
	}
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	cr := csv.NewReader(br)
	cr.FieldsPerRecord = -1
	cr.ReuseRecord = true
	header, err := cr.Read()
	if err != nil {
		return fmt.Errorf("read header: %w", err)
	}
	col := map[string]int{}
	for i, h := range header {
		col[strings.TrimSpace(h)] = i
	}
	for _, need := range []string{"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight"} {
		if _, ok := col[need]; !ok {
			return fmt.Errorf("%w: missing column %q", ErrAPI, need)
		}
	}
	typeCol, hasType := col["type"]
	get := func(rec []string, name string) string {
		if i, ok := col[name]; ok && i < len(rec) {
			return rec[i]
		}
		return ""
	}
	num := func(s string) float64 {
		v, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
		return v
	}
	for line := 2; ; line++ {
		rec, err := cr.Read()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("line %d: %w", line, err)
		}
		lat, err1 := strconv.ParseFloat(get(rec, "latitude"), 64)
		lon, err2 := strconv.ParseFloat(get(rec, "longitude"), 64)
		if err1 != nil || err2 != nil {
			continue
		}
		hhmm, _ := strconv.Atoi(strings.TrimSpace(get(rec, "acq_time")))
		d := harmonize.Detection{
			Lat: lat, Lon: lon,
			Date:       strings.TrimSpace(get(rec, "acq_date")),
			Time:       hhmm,
			Satellite:  harmonize.NormalizeSatellite(get(rec, "satellite")),
			Confidence: strings.TrimSpace(get(rec, "confidence")),
			FRP:        num(get(rec, "frp")),
			Scan:       num(get(rec, "scan")),
			Track:      num(get(rec, "track")),
		}
		if dn := strings.TrimSpace(get(rec, "daynight")); dn != "" {
			d.DayNight = strings.ToUpper(dn)[0]
		}
		if hasType && typeCol < len(rec) {
			if v, err := strconv.Atoi(strings.TrimSpace(rec[typeCol])); err == nil {
				d.Type, d.HasType = v, true
			}
		}
		if err := fn(d); err != nil {
			return err
		}
	}
}

// Products of the yearly archive by country, as named in the URLs.
const (
	ProductMODIS  = "modis"
	ProductSNPP   = "viirs-snpp"
	ProductNOAA20 = "viirs-jpss1"
)

// IndexEntry describes one file of the yearly archive.
type IndexEntry struct {
	Size    int64
	Updated string
}

// Index lists the files of the yearly archive. A country with no detections
// in a year has no file.
type Index map[string]IndexEntry

// FileName returns the archive file name of a product, year and country.
func FileName(product string, year int, country string) string {
	return fmt.Sprintf("%s_%d_%s.csv", product, year, country)
}

// ParseIndex reads yearly_summary_files.txt.
func ParseIndex(r io.Reader) (Index, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1
	rows, err := cr.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read index: %w", err)
	}
	if len(rows) == 0 || len(rows[0]) == 0 || rows[0][0] != "filename" {
		return nil, fmt.Errorf("%w: unexpected index format", ErrAPI)
	}
	idx := Index{}
	for _, row := range rows[1:] {
		if len(row) < 3 || !strings.HasSuffix(row[0], ".csv") {
			continue
		}
		size, _ := strconv.ParseInt(row[1], 10, 64)
		idx[row[0]] = IndexEntry{Size: size, Updated: row[2]}
	}
	return idx, nil
}

// Has reports whether the archive has a file.
func (idx Index) Has(product string, year int, country string) bool {
	_, ok := idx[FileName(product, year, country)]
	return ok
}

// Countries lists every country with MODIS files, as FIRMS spells them
// ("South_Africa").
func (idx Index) Countries() []string {
	set := map[string]struct{}{}
	for name := range idx {
		parts := strings.SplitN(strings.TrimSuffix(name, ".csv"), "_", 3)
		if len(parts) == 3 && parts[0] == ProductMODIS {
			set[parts[2]] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for c := range set {
		out = append(out, c)
	}
	sort.Strings(out)
	return out
}

// LastYear is the most recent year in the archive.
func (idx Index) LastYear() int {
	last := 0
	for name := range idx {
		parts := strings.SplitN(name, "_", 3)
		if len(parts) == 3 {
			if y, err := strconv.Atoi(parts[1]); err == nil && y > last {
				last = y
			}
		}
	}
	return last
}
