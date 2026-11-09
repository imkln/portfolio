resource "aws_dynamodb_table" "collections" {
  name                        = "${var.application_name}-collections"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  deletion_protection_enabled = true

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "photos" {
  name                        = "${var.application_name}-photos"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  deletion_protection_enabled = true

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "state"
    type = "S"
  }

  attribute {
    name = "uploadKey"
    type = "S"
  }

  global_secondary_index {
    name               = "photos-by-state"
    projection_type    = "INCLUDE"
    non_key_attributes = ["name", "uploadedAt"]

    key_schema {
      attribute_name = "state"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "uploadKey"
      key_type       = "RANGE"
    }
  }

  point_in_time_recovery {
    enabled = true
  }
}
