package utils

import (
	"encoding/json"
	"io"
	"net/http"
)

func DecodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, value any) bool {
	return decodeJSON(w, r, maxBytes, value, false)
}

func DecodeStrictJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, value any) bool {
	return decodeJSON(w, r, maxBytes, value, true)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, value any, strict bool) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBytes))
	if strict {
		decoder.DisallowUnknownFields()
	}
	return decoder.Decode(value) == nil && decoder.Decode(new(any)) == io.EOF
}
