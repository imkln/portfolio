package photos

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func TestReserveAnalysisReportsALostReservation(t *testing.T) {
	client := &readyWriteClient{updateError: &types.ConditionalCheckFailedException{}}
	store := NewDynamoStore(client, "photos")

	reserved, err := store.ReserveAnalysis(t.Context(), "lake")

	if err != nil || reserved {
		t.Fatalf("reserved = %t, error = %v", reserved, err)
	}
	if got := aws.ToString(client.update.ConditionExpression); got != "attribute_not_exists(#state) AND attribute_not_exists(analysisAttempted)" {
		t.Fatalf("reservation condition = %q", got)
	}
}

func TestSaveReadyWritesInitialTagsWithCatalogCheck(t *testing.T) {
	client := &readyWriteClient{}
	store := NewDynamoStore(client, "photos")
	photo := Photo{ID: "lake", Name: "Lake.jpg", UploadedAt: time.Now(), TagIDs: []string{"water"}}
	catalog := &types.ConditionCheck{TableName: aws.String("photos")}

	saved, err := store.SaveReady(t.Context(), photo, true, catalog)

	if err != nil || !saved {
		t.Fatalf("saved = %t, error = %v", saved, err)
	}
	if len(client.writes) != 2 || client.writes[0].ConditionCheck != catalog || client.writes[1].Update == nil {
		t.Fatal("expected a catalog condition and a photo update in one transaction")
	}
	update := client.writes[1].Update
	tags, ok := update.ExpressionAttributeValues[":tags"].(*types.AttributeValueMemberSS)
	if !ok || len(tags.Value) != 1 || tags.Value[0] != "water" {
		t.Fatalf("expected initial tag IDs as a string set, got %v", tags)
	}
}

func TestSaveReadyReportsAChangedCatalog(t *testing.T) {
	client := &readyWriteClient{transactionError: &types.TransactionCanceledException{
		CancellationReasons: []types.CancellationReason{{Code: aws.String("ConditionalCheckFailed")}, {Code: aws.String("None")}},
	}}
	store := NewDynamoStore(client, "photos")

	saved, err := store.SaveReady(t.Context(), Photo{ID: "lake", TagIDs: []string{"water"}}, true, &types.ConditionCheck{})

	if saved || !errors.Is(err, ErrCatalogChanged) {
		t.Fatalf("saved = %t, error = %v", saved, err)
	}
}

type readyWriteClient struct {
	dynamoClient
	update           *dynamodb.UpdateItemInput
	updateError      error
	writes           []types.TransactWriteItem
	transactionError error
}

func (client *readyWriteClient) UpdateItem(_ context.Context, input *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	client.update = input
	return &dynamodb.UpdateItemOutput{}, client.updateError
}

func (client *readyWriteClient) TransactWriteItems(_ context.Context, input *dynamodb.TransactWriteItemsInput, _ ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	client.writes = input.TransactItems
	return &dynamodb.TransactWriteItemsOutput{}, client.transactionError
}
