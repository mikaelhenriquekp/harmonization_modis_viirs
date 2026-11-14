package harmonize

import "testing"

func TestNormalizeSatellite(t *testing.T) {
	tests := map[string]Satellite{
		"Aqua": Aqua, "A": Aqua, "aqua ": Aqua,
		"Terra": Terra, "T": Terra,
		"N": SNPP, "NPP": SNPP, "Suomi NPP": SNPP, "SNPP": SNPP,
		"N20": NOAA20, "NOAA-20": NOAA20, "J1": NOAA20, "1": NOAA20,
		"N21": NOAA21, "J2": NOAA21, "2": NOAA21,
		"Landsat": Other, "": Other,
	}
	for in, want := range tests {
		if got := NormalizeSatellite(in); got != want {
			t.Errorf("NormalizeSatellite(%q) = %q, want %q", in, got, want)
		}
	}
}

func modisRow() Detection {
	return Detection{Lat: 38.1, Lon: -1.2, Date: "2015-08-10", Time: 1305, Satellite: Aqua,
		Confidence: "60", FRP: 12.5, DayNight: 'D', Type: 0, HasType: true}
}

func viirsRow() Detection {
	return Detection{Lat: 38.1, Lon: -1.2, Date: "2015-08-10", Time: 1305, Satellite: SNPP,
		Confidence: "n", FRP: 3.1, DayNight: 'N', Type: 0, HasType: true}
}

func TestFilterKeep(t *testing.T) {
	box := &BBox{LatMin: 35.9, LatMax: 43.9, LonMin: -9.6, LonMax: 4.4}
	mod := func(f func(*Detection)) Detection { d := modisRow(); f(&d); return d }
	vmod := func(f func(*Detection)) Detection { d := viirsRow(); f(&d); return d }
	tests := []struct {
		name string
		d    Detection
		sat  Satellite
		box  *BBox
		want bool
	}{
		{"aqua vegetation fire", modisRow(), Aqua, box, true},
		{"terra is dropped", mod(func(d *Detection) { d.Satellite = Terra }), Aqua, box, false},
		{"static source type 2", mod(func(d *Detection) { d.Type = 2 }), Aqua, box, false},
		{"volcano type 1", mod(func(d *Detection) { d.Type = 1 }), Aqua, box, false},
		{"offshore type 3", mod(func(d *Detection) { d.Type = 3 }), Aqua, box, false},
		{"modis confidence 29", mod(func(d *Detection) { d.Confidence = "29" }), Aqua, box, false},
		{"modis confidence 30", mod(func(d *Detection) { d.Confidence = "30" }), Aqua, box, true},
		{"modis bad confidence", mod(func(d *Detection) { d.Confidence = "x" }), Aqua, box, false},
		{"outside box", mod(func(d *Detection) { d.Lat = 28 }), Aqua, box, false},
		{"no box keeps all", mod(func(d *Detection) { d.Lat = 28 }), Aqua, nil, true},
		{"viirs nominal", viirsRow(), SNPP, box, true},
		{"viirs high", vmod(func(d *Detection) { d.Confidence = "h" }), SNPP, box, true},
		{"viirs low", vmod(func(d *Detection) { d.Confidence = "l" }), SNPP, box, false},
		{"viirs low upper", vmod(func(d *Detection) { d.Confidence = "LOW" }), SNPP, box, false},
		{"other viirs satellite", vmod(func(d *Detection) { d.Satellite = NOAA20 }), SNPP, box, false},
		{"nrt without type is kept", vmod(func(d *Detection) { d.HasType = false; d.Type = 0 }), SNPP, box, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := Filter{Satellite: tt.sat, Box: tt.box}
			if got := f.Keep(tt.d); got != tt.want {
				t.Errorf("Keep() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFixedSourcesMaskOnlyProvisional(t *testing.T) {
	mask := NewFixedSources()
	mask.Add(38.10, -1.20)
	nrt := viirsRow()
	nrt.HasType = false
	nrt.Lat, nrt.Lon = 38.109, -1.191 // within one 0.01 step of the fixed source
	f := Filter{Satellite: SNPP, Mask: mask}
	if f.Keep(nrt) {
		t.Error("provisional detection on a fixed source was kept")
	}
	archive := viirsRow() // has type 0: archive data is never masked
	archive.Lat, archive.Lon = 38.10, -1.20
	if !f.Keep(archive) {
		t.Error("archive detection with type 0 was masked")
	}
	far := nrt
	far.Lat = 38.5
	if !f.Keep(far) {
		t.Error("provisional detection far from fixed sources was masked")
	}
}

func TestSolarHour(t *testing.T) {
	if got := SolarHour(1200, 0); got != 12 {
		t.Errorf("SolarHour(1200, 0) = %v", got)
	}
	if got := SolarHour(1330, 30); got != 15.5 {
		t.Errorf("SolarHour(1330, 30) = %v", got)
	}
	if got := SolarHour(100, -30); got != 23 {
		t.Errorf("SolarHour(100, -30) = %v", got)
	}
}
