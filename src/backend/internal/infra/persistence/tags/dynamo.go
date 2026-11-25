package tagsstore

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	tagmodel "github.com/imkln/portfolio/src/backend/internal/domain/tags"
)

type dynamoStore struct {
	client *dynamodb.Client
	table  string
}

func NewDynamoStore(client *dynamodb.Client, table string) *dynamoStore {
	return &dynamoStore{client: client, table: table}
}

func (store *dynamoStore) List(ctx context.Context) ([]tagmodel.Tag, error) {
	tags, _, err := store.load(ctx)
	return tags, err
}

func (store *dynamoStore) Snapshot(ctx context.Context) ([]tagmodel.Tag, *string, error) {
	return store.load(ctx)
}

func catalogKey() map[string]types.AttributeValue {
	return map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: "tags"}}
}

func (store *dynamoStore) load(ctx context.Context) ([]tagmodel.Tag, *string, error) {
	var tags []tagmodel.Tag
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(store.table),
		Key:            catalogKey(),
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

func (store *dynamoStore) Update(ctx context.Context, change func([]tagmodel.Tag) ([]tagmodel.Tag, error)) error {
	tags, previous, err := store.load(ctx)
	if err != nil {
		return err
	}

	tags, err = change(tags)
	if err != nil {
		return err
	}
	return store.save(ctx, tags, previous)
}

func (store *dynamoStore) save(ctx context.Context, tags []tagmodel.Tag, previous *string) error {
	data, err := json.Marshal(tags)
	if err != nil {
		return err
	}
	if len(data) > 380*1024 {
		return tagmodel.ErrCatalogFull
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
	var conflict *types.ConditionalCheckFailedException
	if errors.As(err, &conflict) {
		return tagmodel.ErrCatalogChanged
	}
	return err
}
