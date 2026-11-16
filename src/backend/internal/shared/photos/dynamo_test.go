package photos

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func TestSaveReadyWritesInitialTags(t *testing.T) {
	client := &readyWriteClient{}
	store := NewDynamoStore(client, "photos")
	photo := Photo{ID: "lake", Name: "Lake.jpg", UploadedAt: time.Now(), TagIDs: []string{"water"}}

	saved, err := store.SaveReady(t.Context(), photo)

	if err != nil || !saved {
		t.Fatalf("saved = %t, error = %v", saved, err)
	}
	tags, ok := client.update.ExpressionAttributeValues[":tags"].(*types.AttributeValueMemberSS)
	if !ok || !slices.Equal(tags.Value, photo.TagIDs) {
		t.Fatalf("expected initial tag IDs as a string set, got %v", tags)
	}
}

type readyWriteClient struct {
	dynamoClient
	update *dynamodb.UpdateItemInput
}

func (client *readyWriteClient) UpdateItem(_ context.Context, input *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	client.update = input
	return &dynamodb.UpdateItemOutput{}, nil
}
