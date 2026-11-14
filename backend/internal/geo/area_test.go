package geo

import (
	"net/url"
	"testing"
)

func TestParseArea(t *testing.T) {
	tests := []struct {
		name    string
		query   string
		want    Area
		wantErr bool
	}{
		{"world by default", "", Area{LatMin: -360, LatMax: 359, Lon: [][2]int16{{-720, 719}}, World: true}, false},
		{"bbox snaps to intersecting cells", "bbox=-2.35,37.37,-0.65,38.76",
			Area{LatMin: 149, LatMax: 155, Lon: [][2]int16{{-10, -3}}}, false},
		{"edge on a cell boundary is not the next cell", "bbox=-2,38,-1,39",
			Area{LatMin: 152, LatMax: 155, Lon: [][2]int16{{-8, -5}}}, false},
		{"crosses the antimeridian", "bbox=170,-45,-170,-30",
			Area{LatMin: -180, LatMax: -121, Lon: [][2]int16{{680, 719}, {-720, -681}}}, false},
		{"point with radius", "lat=38.0&lon=-1.13&radius_km=10",
			Area{LatMin: 151, LatMax: 152, Lon: [][2]int16{{-5, -5}}}, false},
		{"point default radius", "lat=0.1&lon=0.1", Area{LatMin: -1, LatMax: 1, Lon: [][2]int16{{-1, 1}}}, false},
		{"bad bbox", "bbox=1,2,3", Area{}, true},
		{"south above north", "bbox=-2,40,-1,39", Area{}, true},
		{"latitude out of range", "bbox=-2,38,-1,91", Area{}, true},
		{"radius too big", "lat=1&lon=1&radius_km=5000", Area{}, true},
		{"lat without lon", "lat=1", Area{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q, _ := url.ParseQuery(tt.query)
			got, err := ParseArea(q)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want error, got %+v", got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			got.BBox = [4]float64{} // checked separately
			if got.LatMin != tt.want.LatMin || got.LatMax != tt.want.LatMax || got.World != tt.want.World || len(got.Lon) != len(tt.want.Lon) {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
			for i := range got.Lon {
				if got.Lon[i] != tt.want.Lon[i] {
					t.Fatalf("lon = %v, want %v", got.Lon, tt.want.Lon)
				}
			}
		})
	}
}

func TestAreaGridBBoxAndArgs(t *testing.T) {
	q, _ := url.ParseQuery("bbox=-2.35,37.37,-0.65,38.76")
	a, err := ParseArea(q)
	if err != nil {
		t.Fatal(err)
	}
	if g := a.GridBBox(); g != [4]float64{-2.5, 37.25, -0.5, 39} {
		t.Errorf("GridBBox = %v", g)
	}
	if a.Cells() != 7*8 {
		t.Errorf("Cells = %d", a.Cells())
	}
	args := a.Args()
	if len(args) != 6 || args[4] != int16(1) || args[5] != int16(0) {
		t.Errorf("Args = %v (second lon range must be empty)", args)
	}
	if a.BBox != [4]float64{-2.35, 37.37, -0.65, 38.76} {
		t.Errorf("BBox = %v", a.BBox)
	}
}

func TestAreaContainsCell(t *testing.T) {
	q, _ := url.ParseQuery("bbox=170,-45,-170,-30")
	a, _ := ParseArea(q)
	if !a.ContainsCell(-150, 700) || !a.ContainsCell(-150, -700) || a.ContainsCell(-150, 0) {
		t.Error("ContainsCell is wrong across the antimeridian")
	}
}
