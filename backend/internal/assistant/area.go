package assistant

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/nasa-challenge/app/backend/internal/geo"
)

// AreaArg is the area of interest as the model writes it.
type AreaArg struct {
	Kind     string       `json:"kind"`
	Name     string       `json:"name,omitempty"`
	West     *float64     `json:"west,omitempty"`
	South    *float64     `json:"south,omitempty"`
	East     *float64     `json:"east,omitempty"`
	North    *float64     `json:"north,omitempty"`
	Lat      *float64     `json:"lat,omitempty"`
	Lon      *float64     `json:"lon,omitempty"`
	RadiusKm *float64     `json:"radius_km,omitempty"`
	Points   [][2]float64 `json:"points,omitempty"` // lon, lat
}

// areaSchema is the JSON schema of AreaArg, shared by the tools.
var areaSchema = json.RawMessage(`{
  "type": "object",
  "description": "Area of interest. kind=world for the whole planet; bbox needs west,south,east,north in degrees; point needs lat,lon and radius_km (default 25, max 1000); polygon needs points as [[lon,lat],...]. Always give a short human name.",
  "properties": {
    "kind": {"type": "string", "enum": ["world", "bbox", "point", "polygon"]},
    "name": {"type": "string", "description": "Human name of the place, e.g. 'Iberian Peninsula'"},
    "west": {"type": "number"}, "south": {"type": "number"}, "east": {"type": "number"}, "north": {"type": "number"},
    "lat": {"type": "number"}, "lon": {"type": "number"}, "radius_km": {"type": "number"},
    "points": {"type": "array", "items": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2}}
  },
  "required": ["kind"]
}`)

func n(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

func need(name string, vs ...*float64) ([]float64, error) {
	out := make([]float64, len(vs))
	for i, v := range vs {
		if v == nil {
			return nil, fmt.Errorf("%w: %s area is missing a coordinate", geo.ErrInvalidArea, name)
		}
		out[i] = *v
	}
	return out, nil
}

// Parse turns the argument into a geo.Area (reusing the API's validation)
// and the compact form the web app puts in its URLs.
func (a *AreaArg) Parse() (geo.Area, string, error) {
	if a == nil || a.Kind == "" || a.Kind == "world" {
		area, err := geo.ParseArea(url.Values{})
		return area, "world", err
	}
	q := url.Values{}
	var search string
	switch a.Kind {
	case "bbox":
		v, err := need("bbox", a.West, a.South, a.East, a.North)
		if err != nil {
			return geo.Area{}, "", err
		}
		s := n(v[0]) + "," + n(v[1]) + "," + n(v[2]) + "," + n(v[3])
		q.Set("bbox", s)
		search = "bbox:" + s
	case "point":
		v, err := need("point", a.Lat, a.Lon)
		if err != nil {
			return geo.Area{}, "", err
		}
		r := geo.DefaultRadiusKm
		if a.RadiusKm != nil {
			r = *a.RadiusKm
		}
		q.Set("lat", n(v[0]))
		q.Set("lon", n(v[1]))
		q.Set("radius_km", n(r))
		search = "point:" + n(v[0]) + "," + n(v[1]) + "," + n(r)
	case "polygon":
		parts := make([]string, 0, len(a.Points)*2)
		for _, p := range a.Points {
			parts = append(parts, n(p[0]), n(p[1]))
		}
		s := strings.Join(parts, ",")
		q.Set("polygon", s)
		search = "polygon:" + s
	default:
		return geo.Area{}, "", fmt.Errorf("%w: unknown kind %q", geo.ErrInvalidArea, a.Kind)
	}
	area, err := geo.ParseArea(q)
	if err != nil {
		return geo.Area{}, "", err
	}
	return area, search, nil
}

// Label is the area's name, or a description of it.
func (a *AreaArg) Label() string {
	switch {
	case a == nil || a.Kind == "" || a.Kind == "world":
		if a != nil && a.Name != "" {
			return a.Name
		}
		return "World"
	case a.Name != "":
		return a.Name
	default:
		return "Custom " + a.Kind
	}
}
