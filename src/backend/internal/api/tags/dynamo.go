package tags

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type dynamoStore struct {
	client *dynamodb.Client
	table  string
}

func NewDynamoStore(client *dynamodb.Client, table string) *dynamoStore {
	return &dynamoStore{client: client, table: table}
}

func (store *dynamoStore) Load(ctx context.Context) ([]Tag, error) {
	tags, _, err := store.load(ctx)
	return tags, err
}

func (store *dynamoStore) load(ctx context.Context) ([]Tag, *string, error) {
	var tags []Tag
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(store.table),
		Key:            map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: "tags"}},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil || len(result.Item) == 0 {
		return tags, nil, err
	}

	value, ok := result.Item["tags"].(*types.AttributeValueMemberS)
	if !ok {
		return tags, nil, errors.New("stored tag list is missing")
	}

	err = json.Unmarshal([]byte(value.Value), &tags)
	return tags, &value.Value, err
}

func (store *dynamoStore) Update(ctx context.Context, change func(*[]Tag) error) error {
	tags, previous, err := store.load(ctx)
	if err != nil {
		return err
	}
	if err := change(&tags); err != nil {
		return err
	}

	err = store.save(ctx, tags, previous)
	var conflict *types.ConditionalCheckFailedException
	if errors.As(err, &conflict) {
		return &problem{http.StatusConflict, "Tags changed. Try again."}
	}
	return err
}

func (store *dynamoStore) save(ctx context.Context, tags []Tag, previous *string) error {
	data, err := json.Marshal(tags)
	if err != nil {
		return err
	}
	if len(data) > 380*1024 {
		return &problem{http.StatusConflict, "The tag list is full."}
	}

	input := &dynamodb.PutItemInput{
		TableName: aws.String(store.table),
		Item: map[string]types.AttributeValue{
			"id":   &types.AttributeValueMemberS{Value: "tags"},
			"tags": &types.AttributeValueMemberS{Value: string(data)},
		},
		ConditionExpression: aws.String("attribute_not_exists(id)"),
	}
	if previous != nil {
		input.ConditionExpression = aws.String("#tags = :previous")
		input.ExpressionAttributeNames = map[string]string{"#tags": "tags"}
		input.ExpressionAttributeValues = map[string]types.AttributeValue{
			":previous": &types.AttributeValueMemberS{Value: *previous},
		}
	}
	_, err = store.client.PutItem(ctx, input)
	return err
}
