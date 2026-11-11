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

role_exists=$(aws iam list-roles --query "contains(Roles[].RoleName, '$role')" --output json)
if [[ "$role_exists" == false ]]; then
  aws iam create-role --role-name "$role" --assume-role-policy-document "$trust" --tags "Key=Project,Value=$application_name" >/dev/null
else
  aws iam get-role --role-name "$role" --output json | jq -e --arg project "$application_name" 'any(.Role.Tags[]?; .Key == "Project" and .Value == $project)' >/dev/null
  aws iam update-assume-role-policy --role-name "$role" --policy-document "$trust"
fi
deploy_policy=$(render_policy < scripts/policies/deploy-role.json)
aws iam put-role-policy --role-name "$role" --policy-name "$role" \
  --policy-document "$deploy_policy"

gh variable set AWS_REGION --repo "$repo" --body "$region"
gh variable set AWS_ROLE_ARN --repo "$repo" --body "arn:aws:iam::$account:role/$role"
gh variable set TF_STATE_BUCKET --repo "$repo" --body "$bucket"

domain="$application_name-$account"
printf 'Google OAuth redirect URI: https://%s.auth.%s.amazoncognito.com/oauth2/idpresponse\n' "$domain" "$region"
