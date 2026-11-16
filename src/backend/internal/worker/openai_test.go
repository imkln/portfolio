package worker

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func TestOpenAIMatchesTagsFromThumbnail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("expected an authenticated POST")
		}
		var request struct {
			Model string `json:"model"`
			Store *bool  `json:"store"`
			Input []struct {
				Content []struct {
					Text string `json:"text"`
					URL  string `json:"image_url"`
				} `json:"content"`
			} `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode request: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if request.Model != "gpt-5.6-luna" || request.Store == nil || *request.Store ||
			len(request.Input) != 1 || len(request.Input[0].Content) != 2 ||
			request.Input[0].Content[0].Text != `[{"id":"lake","name":"Lake"}]` ||
			!strings.HasPrefix(request.Input[0].Content[1].URL, "data:image/jpeg;base64,") {
			t.Error("expected the selected model, candidates and thumbnail")
		}
		w.Write([]byte(`{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"{\"tagIds\":[\"lake\"]}"}]}],"usage":{"input_tokens":120,"output_tokens":10}}`))
	}))
	defer server.Close()
	client := &OpenAI{key: "test-key", endpoint: server.URL}

	ids, err := client.Match(t.Context(), jpegImage(t, 480, 320), []Candidate{{ID: "lake", Name: "Lake"}})

	if err != nil || !slices.Equal(ids, []string{"lake"}) {
		t.Fatalf("matches = %v, error = %v", ids, err)
	}
}

func TestOpenAIDoesNotRetryServiceErrors(t *testing.T) {
	calls := make(chan struct{}, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls <- struct{}{}
		http.Error(w, "private candidate information", http.StatusTooManyRequests)
	}))
	defer server.Close()
	client := &OpenAI{key: "test-key", endpoint: server.URL}

	_, err := client.Match(t.Context(), jpegImage(t, 480, 320), []Candidate{{ID: "lake", Name: "Lake"}})

	if err == nil || err.Error() != "automatic tagging returned HTTP 429" || len(calls) != 1 {
		t.Fatalf("error = %v, requests = %d", err, len(calls))
	}
}
