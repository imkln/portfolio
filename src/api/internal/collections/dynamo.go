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

func (store *dynamoStore) Load(ctx context.Context) (List, error) {
	var config List
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(store.table),
		Key:            map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: "collections"}},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil || len(result.Item) == 0 {
		return config, err
	}

	value, ok := result.Item["config"].(*types.AttributeValueMemberS)
	if !ok {
		return config, errors.New("stored collections are missing their config")
	}

	err = json.Unmarshal([]byte(value.Value), &config)
	return config, err
}

func (store *dynamoStore) Save(ctx context.Context, config List) error {
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}
	if len(data) > maxListBytes {
		return errListTooLarge
	}

	_, err = store.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(store.table),
		Item: map[string]types.AttributeValue{
			"id":     &types.AttributeValueMemberS{Value: "collections"},
			"config": &types.AttributeValueMemberS{Value: string(data)},
		},
	})
	return err
}
