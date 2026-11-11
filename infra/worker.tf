locals {
  worker_timeout = 45
}

resource "aws_sqs_queue" "photo_uploads" {
  name                       = "${var.application_name}-photo-uploads"
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 6 * local.worker_timeout
}

resource "aws_sqs_queue_policy" "photo_uploads" {
  queue_url = aws_sqs_queue.photo_uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.photo_uploads.arn
      Condition = {
        ArnEquals    = { "aws:SourceArn" = aws_s3_bucket.photos.arn }
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_s3_bucket_notification" "photo_uploads" {
  bucket = aws_s3_bucket.photos.id

  queue {
    queue_arn     = aws_sqs_queue.photo_uploads.arn
    events        = ["s3:ObjectCreated:Post"]
    filter_prefix = "uploads/"
  }

  depends_on = [aws_sqs_queue_policy.photo_uploads]
}

resource "aws_iam_role" "worker" {
  name               = "${var.application_name}-worker"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy" "worker" {
  name = "${var.application_name}-runtime"
  role = aws_iam_role.worker.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.photo_uploads.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.photos.arn}/uploads/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = ["${aws_s3_bucket.photos.arn}/originals/*", "${aws_s3_bucket.photos.arn}/thumbnails/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.photos.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.worker.arn}:log-stream:*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.application_name}-worker"
  retention_in_days = 7
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.application_name}-worker"
  role             = aws_iam_role.worker.arn
  runtime          = "provided.al2023"
  handler          = "bootstrap"
  architectures    = ["arm64"]
  filename         = "${path.module}/../build/worker.zip"
  source_code_hash = filebase64sha256("${path.module}/../build/worker.zip")
  timeout          = local.worker_timeout
  memory_size      = 1024

  environment {
    variables = {
      PHOTO_UPLOAD_BUCKET = aws_s3_bucket.photos.bucket
      PHOTOS_TABLE        = aws_dynamodb_table.photos.name
    }
  }

  depends_on = [aws_iam_role_policy.worker, aws_cloudwatch_log_group.worker]
}

resource "aws_lambda_event_source_mapping" "photo_uploads" {
  event_source_arn = aws_sqs_queue.photo_uploads.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 1
}
