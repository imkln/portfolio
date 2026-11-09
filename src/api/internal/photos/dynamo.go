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

const readyState = "ready"

type queryClient interface {
	Query(context.Context, *dynamodb.QueryInput, ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
}

type dynamoStore struct {
	client queryClient
	table  string
}

func NewDynamoStore(client queryClient, table string) *dynamoStore {
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
