package testutils

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const Origin = "https://portfolio.example.test"

func Request(handler http.Handler, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	var payload io.Reader
	if body != "" {
		payload = strings.NewReader(body)
	}

	req := httptest.NewRequest(method, Origin+path, payload)
	req.Header.Set("Origin", Origin)
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func CheckStatus(t *testing.T, response *httptest.ResponseRecorder, status int) {
	t.Helper()

	if response.Code != status {
		t.Fatalf("status = %d, want %d; body: %s", response.Code, status, response.Body)
	}
}

func WriteJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Errorf("write test response: %v", err)
	}
}
