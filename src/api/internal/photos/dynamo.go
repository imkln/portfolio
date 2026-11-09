package photos

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	readyState    = "ready"
	deletingState = "deleting"
)

type dynamoClient interface {
	Query(context.Context, *dynamodb.QueryInput, ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	GetItem(context.Context, *dynamodb.GetItemInput, ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	UpdateItem(context.Context, *dynamodb.UpdateItemInput, ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
	DeleteItem(context.Context, *dynamodb.DeleteItemInput, ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
}

type dynamoStore struct {
	client dynamoClient
	table  string
}

func NewDynamoStore(client dynamoClient, table string) *dynamoStore {
	return &dynamoStore{client: client, table: table}
}

func (store *dynamoStore) ListReady(ctx context.Context, after string, limit int32) ([]Photo, string, error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(store.table),
		IndexName:              aws.String("photos-by-state"),
		KeyConditionExpression: aws.String("#state = :state"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":state": &types.AttributeValueMemberS{Value: readyState},
		},
		ScanIndexForward: aws.Bool(false),
		Limit:            aws.Int32(limit),
	}
	if after != "" {
		_, id, _ := strings.Cut(after, "#")
		input.ExclusiveStartKey = map[string]types.AttributeValue{
			"id":        &types.AttributeValueMemberS{Value: id},
			"state":     &types.AttributeValueMemberS{Value: readyState},
			"uploadKey": &types.AttributeValueMemberS{Value: after},
		}
	}

	result, err := store.client.Query(ctx, input)
	if err != nil {
		return nil, "", err
	}

	items := make([]Photo, 0, len(result.Items))
	for _, item := range result.Items {
		id, hasID := item["id"].(*types.AttributeValueMemberS)
		name, hasName := item["name"].(*types.AttributeValueMemberS)
		stamp, hasStamp := item["uploadedAt"].(*types.AttributeValueMemberS)
		if !hasID || !hasName || !hasStamp {
			return nil, "", errors.New("stored photo is missing metadata")
		}
		uploadedAt, err := time.Parse(time.RFC3339Nano, stamp.Value)
		if err != nil {
			return nil, "", errors.New("stored photo has an invalid upload time")
		}

		items = append(items, Photo{ID: id.Value, Name: name.Value, UploadedAt: uploadedAt})
	}

	var next string
	if len(result.LastEvaluatedKey) > 0 {
		key, ok := result.LastEvaluatedKey["uploadKey"].(*types.AttributeValueMemberS)
		if !ok {
			return nil, "", errors.New("photo query is missing the last upload key")
		}
		next = key.Value
	}
	return items, next, nil
}

func (store *dynamoStore) IsReady(ctx context.Context, id string) (bool, error) {
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:            aws.String(store.table),
		Key:                  photoKey(id),
		ConsistentRead:       aws.Bool(true),
		ProjectionExpression: aws.String("#state"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
		},
	})
	if err != nil {
		return false, err
	}

	state, ok := result.Item["state"].(*types.AttributeValueMemberS)
	return ok && state.Value == readyState, nil
}

func (store *dynamoStore) BeginDelete(ctx context.Context, id string) (bool, error) {
	_, err := store.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:           aws.String(store.table),
		Key:                 photoKey(id),
		ConditionExpression: aws.String("#state = :ready"),
		UpdateExpression:    aws.String("SET #state = :deleting"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":ready":    &types.AttributeValueMemberS{Value: readyState},
			":deleting": &types.AttributeValueMemberS{Value: deletingState},
		},
	})
	var notReady *types.ConditionalCheckFailedException
	if errors.As(err, &notReady) {
		return false, nil
	}
	return err == nil, err
}

func (store *dynamoStore) FinishDelete(ctx context.Context, id string) error {
	_, err := store.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName:           aws.String(store.table),
		Key:                 photoKey(id),
		ConditionExpression: aws.String("#state = :deleting"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":deleting": &types.AttributeValueMemberS{Value: deletingState},
		},
	})
	return err
}

func photoKey(id string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}}
}
