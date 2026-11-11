package testutils

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

func NewFakeDynamoClient(t *testing.T) *dynamodb.Client {
	t.Helper()

	var item atomic.Value
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Header.Get("X-Amz-Target") {
		case "DynamoDB_20120810.PutItem":
			var input struct {
				Item json.RawMessage
			}
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Errorf("decode test DynamoDB write: %v", err)
				http.Error(w, "invalid test write", http.StatusBadRequest)
				return
			}
			item.Store(input.Item)
			WriteJSON(t, w, struct{}{})
		case "DynamoDB_20120810.GetItem":
			response := map[string]any{}
			if saved := item.Load(); saved != nil {
				response["Item"] = saved
			}
			WriteJSON(t, w, response)
		default:
			t.Errorf("unexpected DynamoDB operation: %s", r.Header.Get("X-Amz-Target"))
			http.Error(w, "unknown test operation", http.StatusBadRequest)
		}
	}))
	t.Cleanup(endpoint.Close)

	return dynamodb.New(dynamodb.Options{
		Region:       "us-east-1",
		BaseEndpoint: aws.String(endpoint.URL),
		Credentials: aws.CredentialsProviderFunc(func(context.Context) (aws.Credentials, error) {
			return aws.Credentials{AccessKeyID: "test", SecretAccessKey: "test"}, nil
		}),
	})
}
