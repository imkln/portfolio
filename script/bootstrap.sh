#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export AWS_PAGER=""

region="${AWS_REGION:-us-east-1}"
application_name="${TF_VAR_application_name:-portfolio}"
repo="imkln/$application_name"
account=$(aws sts get-caller-identity --query Account --output text)
bucket="$application_name-state-$account-$region"
issuer=token.actions.githubusercontent.com
provider="arn:aws:iam::$account:oidc-provider/$issuer"
role="$application_name-deploy"
runtime_boundary="arn:aws:iam::$account:policy/$application_name-runtime-boundary"

subject=$(gh api "repos/$repo" --jq '"repo:\(.owner.login)@\(.owner.id)/\(.name)@\(.id):ref:refs/heads/*"')
trust=$(jq -n --arg provider "$provider" --arg subject "$subject" '{
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Principal: {Federated: $provider},
    Action: "sts:AssumeRoleWithWebIdentity",
    Condition: {
      StringEquals: {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
      StringLike: {"token.actions.githubusercontent.com:sub": $subject}
    }
  }]
}')

bucket_exists=$(aws s3api list-buckets --prefix "$bucket" --query "contains(Buckets[].Name, '$bucket')" --output json)
if [[ "$bucket_exists" == false ]]; then
  if [[ "$region" == us-east-1 ]]; then
    aws s3api create-bucket --region "$region" --bucket "$bucket" >/dev/null
  else
    aws s3api create-bucket --region "$region" --bucket "$bucket" \
      --create-bucket-configuration "LocationConstraint=$region" >/dev/null
  fi
fi

aws s3api put-public-access-block --region "$region" --bucket "$bucket" --expected-bucket-owner "$account" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --region "$region" --bucket "$bucket" --expected-bucket-owner "$account" \
  --versioning-configuration Status=Enabled

provider_exists=$(aws iam list-open-id-connect-providers --query "contains(OpenIDConnectProviderList[].Arn, '$provider')" --output json)
if [[ "$provider_exists" == false ]]; then
  aws iam create-open-id-connect-provider --url "https://$issuer" --client-id-list sts.amazonaws.com >/dev/null
else
  has_audience=$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider" \
    --query "contains(ClientIDList, 'sts.amazonaws.com')" --output json)
  if [[ "$has_audience" == false ]]; then
    aws iam add-client-id-to-open-id-connect-provider --open-id-connect-provider-arn "$provider" --client-id sts.amazonaws.com
  fi
fi

render_policy() {
  jq --arg account "$account" --arg region "$region" --arg bucket "$bucket" --arg application "$application_name" '
    walk(if type == "string" then
      gsub("@ACCOUNT@"; $account) | gsub("@REGION@"; $region) | gsub("@BUCKET@"; $bucket) | gsub("@APPLICATION@"; $application)
    else . end)
  '
}

runtime=$(render_policy <<'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:@REGION@:@ACCOUNT@:table/@APPLICATION@-collections"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:@REGION@:@ACCOUNT@:log-group:/aws/lambda/@APPLICATION@-api:log-stream:*"
    }
  ]
}
POLICY
)
boundary_exists=$(aws iam list-policies --scope Local --query "contains(Policies[].Arn, '$runtime_boundary')" --output json)
if [[ "$boundary_exists" == false ]]; then
  aws iam create-policy --policy-name "$application_name-runtime-boundary" --policy-document "$runtime" --tags "Key=Project,Value=$application_name" >/dev/null
else
  aws iam list-policy-tags --policy-arn "$runtime_boundary" --output json | jq -e --arg project "$application_name" 'any(.Tags[]?; .Key == "Project" and .Value == $project)' >/dev/null
  version=$(aws iam get-policy --policy-arn "$runtime_boundary" --query Policy.DefaultVersionId --output text)
  current=$(aws iam get-policy-version --policy-arn "$runtime_boundary" --version-id "$version" --query PolicyVersion.Document --output json)
  if [[ $(jq -cS . <<< "$current") != "$(jq -cS . <<< "$runtime")" ]]; then
    oldest=$(aws iam list-policy-versions --policy-arn "$runtime_boundary" \
      --query 'sort_by(Versions[?IsDefaultVersion==`false`], &CreateDate)[0].VersionId' --output text)
    if [[ "$oldest" != None ]]; then
      aws iam delete-policy-version --policy-arn "$runtime_boundary" --version-id "$oldest"
    fi
    aws iam create-policy-version --policy-arn "$runtime_boundary" --policy-document "$runtime" --set-as-default >/dev/null
  fi
fi

role_exists=$(aws iam list-roles --query "contains(Roles[].RoleName, '$role')" --output json)
if [[ "$role_exists" == false ]]; then
  aws iam create-role --role-name "$role" --assume-role-policy-document "$trust" --tags "Key=Project,Value=$application_name" >/dev/null
else
  aws iam get-role --role-name "$role" --output json | jq -e --arg project "$application_name" 'any(.Role.Tags[]?; .Key == "Project" and .Value == $project)' >/dev/null
  aws iam update-assume-role-policy --role-name "$role" --policy-document "$trust"
fi
deploy_policy=$(render_policy <<'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::@BUCKET@",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "terraform.tfstate*",
            "env:/*"
          ]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::@BUCKET@/terraform.tfstate"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::@BUCKET@/terraform.tfstate.tflock"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole"
      ],
      "Resource": "arn:aws:iam::@ACCOUNT@:role/@APPLICATION@-api",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::@ACCOUNT@:policy/@APPLICATION@-runtime-boundary"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:GetRole",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:ListInstanceProfilesForRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateAssumeRolePolicy",
        "iam:DeleteRole",
        "iam:GetRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy"
      ],
      "Resource": "arn:aws:iam::@ACCOUNT@:role/@APPLICATION@-api"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::@ACCOUNT@:role/@APPLICATION@-api",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionCodeSigningConfig",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:ListVersionsByFunction",
        "lambda:ListTags",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:GetPolicy",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:DeleteFunction"
      ],
      "Resource": "arn:aws:lambda:@REGION@:@ACCOUNT@:function:@APPLICATION@-api"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups"
      ],
      "Resource": "arn:aws:logs:@REGION@:@ACCOUNT@:log-group:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DeleteRetentionPolicy",
        "logs:ListTagsForResource",
        "logs:TagResource",
        "logs:UntagResource",
        "logs:DeleteLogGroup"
      ],
      "Resource": [
        "arn:aws:logs:@REGION@:@ACCOUNT@:log-group:/aws/lambda/@APPLICATION@-api",
        "arn:aws:logs:@REGION@:@ACCOUNT@:log-group:/aws/lambda/@APPLICATION@-api:*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:UpdateContinuousBackups",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:ListTagsOfResource",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:UpdateTable",
        "dynamodb:DeleteTable"
      ],
      "Resource": "arn:aws:dynamodb:@REGION@:@ACCOUNT@:table/@APPLICATION@-collections"
    },
    {
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PATCH",
        "apigateway:PUT",
        "apigateway:DELETE",
        "apigateway:TagResource"
      ],
      "Resource": [
        "arn:aws:apigateway:@REGION@::/apis",
        "arn:aws:apigateway:@REGION@::/apis/*",
        "arn:aws:apigateway:@REGION@::/tags/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:CreateUserPool",
        "cognito-idp:DescribeUserPoolDomain"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "@REGION@"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:DescribeUserPool",
        "cognito-idp:GetUserPoolMfaConfig",
        "cognito-idp:UpdateUserPool",
        "cognito-idp:DeleteUserPool",
        "cognito-idp:ListTagsForResource",
        "cognito-idp:TagResource",
        "cognito-idp:UntagResource",
        "cognito-idp:CreateUserPoolDomain",
        "cognito-idp:UpdateUserPoolDomain",
        "cognito-idp:DeleteUserPoolDomain",
        "cognito-idp:CreateIdentityProvider",
        "cognito-idp:DescribeIdentityProvider",
        "cognito-idp:UpdateIdentityProvider",
        "cognito-idp:DeleteIdentityProvider",
        "cognito-idp:CreateUserPoolClient",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:UpdateUserPoolClient",
        "cognito-idp:DeleteUserPoolClient"
      ],
      "Resource": "arn:aws:cognito-idp:@REGION@:@ACCOUNT@:userpool/*"
    }
  ]
}
POLICY
)
aws iam put-role-policy --role-name "$role" --policy-name "$role" \
  --policy-document "$deploy_policy"

gh variable set AWS_REGION --repo "$repo" --body "$region"
gh variable set AWS_ROLE_ARN --repo "$repo" --body "arn:aws:iam::$account:role/$role"
gh variable set AWS_RUNTIME_BOUNDARY_ARN --repo "$repo" --body "$runtime_boundary"
gh variable set TF_STATE_BUCKET --repo "$repo" --body "$bucket"

domain="$application_name-$account"
gh variable set COGNITO_DOMAIN_PREFIX --repo "$repo" --body "$domain"
printf 'Google OAuth redirect URI: https://%s.auth.%s.amazoncognito.com/oauth2/idpresponse\n' "$domain" "$region"
