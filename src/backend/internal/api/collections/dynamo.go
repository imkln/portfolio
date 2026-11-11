package collections

import (
	"context"
	"encoding/json"
	"errors"

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

var errConcurrentUpdate = errors.New("collections changed during update")

func (store *dynamoStore) Load(ctx context.Context) (List, error) {
	config, _, err := store.load(ctx)
	return config, err
}

func (store *dynamoStore) load(ctx context.Context) (List, *string, error) {
	var config List
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(store.table),
		Key:            map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: "collections"}},
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

func (store *dynamoStore) Update(ctx context.Context, change func(*List) error) error {
	config, previous, err := store.load(ctx)
	if err != nil {
		return err
	}
	if err := change(&config); err != nil {
		return err
	}

	err = store.save(ctx, config, previous)
	var conflict *types.ConditionalCheckFailedException
	if errors.As(err, &conflict) {
		return errConcurrentUpdate
	}
	return err
}

func (store *dynamoStore) save(ctx context.Context, config List, previous *string) error {
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}
	if len(data) > maxListBytes {
		return errListTooLarge
	}

	input := &dynamodb.PutItemInput{
		TableName: aws.String(store.table),
		Item: map[string]types.AttributeValue{
			"id":     &types.AttributeValueMemberS{Value: "collections"},
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
	return err
}
