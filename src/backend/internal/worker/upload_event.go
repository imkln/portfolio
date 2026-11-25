package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/aws/aws-lambda-go/events"

	"github.com/imkln/portfolio/src/backend/internal/domain/photos"
)

func (worker *Worker) ProcessUploadEvent(ctx context.Context, bucket string, event events.SQSEvent) error {
	for _, message := range event.Records {
		var upload events.S3Event
		if err := json.Unmarshal([]byte(message.Body), &upload); err != nil {
			return fmt.Errorf("read S3 upload event: %w", err)
		}

		for _, record := range upload.Records {
			if record.S3.Bucket.Name != bucket {
				continue
			}

			err := worker.Process(ctx, record.S3.Object.URLDecodedKey, record.EventTime)
			if errors.Is(err, photos.ErrInvalidUpload) {
				slog.WarnContext(ctx, "ignored invalid photo upload")
				continue
			}
			if err != nil {
				return err
			}
		}
	}
	return nil
}
