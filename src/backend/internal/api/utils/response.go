package utils

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

func WriteJSONError(w http.ResponseWriter, status int) {
	WriteJSON(w, status, map[string]string{"error": http.StatusText(status)})
}

func WriteJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Error("write JSON response", "error", err)
	}
}
