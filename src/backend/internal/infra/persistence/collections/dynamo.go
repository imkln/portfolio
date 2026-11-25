package collectionsstore

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/imkln/portfolio/src/backend/internal/domain/collections"
)

type dynamoStore struct {
	client *dynamodb.Client
	table  string
}

func NewDynamoStore(client *dynamodb.Client, table string) *dynamoStore {
	return &dynamoStore{client: client, table: table}
}

const collectionsKey = "collections"

func (store *dynamoStore) Load(ctx context.Context) (collections.List, error) {
	config, _, err := store.load(ctx)
	return config, err
}

func (store *dynamoStore) load(ctx context.Context) (collections.List, *string, error) {
	var config collections.List
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(store.table),
		Key:            map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: collectionsKey}},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil || len(result.Item) == 0 {
		return config, nil, err
	}

	value, ok := result.Item["config"].(*types.AttributeValueMemberS)
	if !ok {
		return config, nil, errors.New("stored collections are missing their config")
	}

	err = json.Unmarshal([]byte(value.Value), &config)
	return config, &value.Value, err
}

func (store *dynamoStore) Update(ctx context.Context, change func(*collections.List) error) error {
	config, previous, err := store.load(ctx)
	if err != nil {
		return err
	}
	if err := change(&config); err != nil {
		return err
	}

	data, err := json.Marshal(config)
	if err != nil {
		return err
	}
	if len(data) > collections.MaxBytes {
		return collections.ErrTooLarge
	}

	input := &dynamodb.PutItemInput{
		TableName: aws.String(store.table),
		Item: map[string]types.AttributeValue{
			"id":     &types.AttributeValueMemberS{Value: collectionsKey},
			"config": &types.AttributeValueMemberS{Value: string(data)},
		},
		ConditionExpression: aws.String("attribute_not_exists(id)"),
	}
	if previous != nil {
		input.ConditionExpression = aws.String("#config = :previous")
		input.ExpressionAttributeNames = map[string]string{"#config": "config"}
		input.ExpressionAttributeValues = map[string]types.AttributeValue{
			":previous": &types.AttributeValueMemberS{Value: *previous},
		}
	}

	_, err = store.client.PutItem(ctx, input)
	if _, conflict := errors.AsType[*types.ConditionalCheckFailedException](err); conflict {
		return collections.ErrConcurrentUpdate
	}
	return err
}
