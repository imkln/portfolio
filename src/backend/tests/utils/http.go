package utils

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

type APIRequest func(method, path, body string) *http.Response

func CheckAPIResponse(t *testing.T, request APIRequest, method, path, body string, status int) []byte {
	t.Helper()

	response := request(method, path, body)
	defer response.Body.Close()
	output, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != status {
		t.Fatalf("%s %s returned %d, want %d; body: %s", method, path, response.StatusCode, status, output)
	}
	return output
}
