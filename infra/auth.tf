resource "random_id" "cookie_key" {
  byte_length = 32
}

resource "aws_cognito_user_pool" "owner" {
  name                = var.application_name
  user_pool_tier      = "LITE"
  deletion_protection = "ACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  username_configuration {
    case_sensitive = false
  }
}

resource "aws_cognito_user_pool_domain" "login" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.owner.id
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.owner.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = var.application_name
  user_pool_id                         = aws_cognito_user_pool.owner.id
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  prevent_user_existence_errors        = "ENABLED"
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  read_attributes                      = ["email", "email_verified"]
  write_attributes                     = ["email", "email_verified"]
  callback_urls                        = ["${aws_apigatewayv2_api.web.api_endpoint}/auth/callback"]
  logout_urls                          = ["${aws_apigatewayv2_api.web.api_endpoint}/"]
}
