# Using GitHub Actions with webMethods API Gateway

![build](https://img.shields.io/github/workflow/status/jiridj/wmtc-blog-apim-github-actions/cicd)
[![open issues](https://img.shields.io/github/issues-raw/jiridj/wmtc-blog-apim-github-actions)](https://github.com/jiridj/wmtc-blog-apim-github-actions/issues)
![views](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fjiridj%2Fwmtc-blog-apim-github-actions&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=views&edge_flat=false)

This is an example of how you can register and promote APIs with [GitHub Actions](https://github.com/features/actions) and [webMethods API Gateway](https://www.softwareag.com/en_corporate/platform/integration-apis/api-management.html). This example comes with my [blog post on TechCommunity](https://tech.forums.softwareag.com/t/using-github-actions-with-webmethods-api-gateway/257584) on the same topic, where you can find more information. 

## See it in action!

You can [see this example in action](https://youtu.be/Llht1ieNFsw) on YouTube!

## Example explained

This example illustrates a simple CI/CD pipeline for three environments: development, staging and production. The idea is that whenever commits are pushed, the CI/CD pipeline runs. 
- When we push changes to the API it needs to be updated in the **development** environment. The development environment always has the latest commit. 
- When we push version tags, the API needs to be updated in the **staging** and the **production** environments. The update of production [requires approval](https://docs.github.com/en/actions/managing-workflow-runs/reviewing-deployments) before it is executed. You can find the complete implementation in [./github/workflows/cicd.yml](https://github.com/jiridj/wmtc-blog-apim-github-actions/blob/main/.github/workflows/cicd.yml). I will use snippets below. 

### Managing versions

I create versions of the API using `npm version`, which automatically increments the version in [package.json](https://github.com/jiridj/wmtc-blog-apim-github-actions/blob/main/package.json), commits the change and tags it with that same version. I have configured the project to run a [script](https://github.com/jiridj/wmtc-blog-apim-github-actions/blob/main/versioning.js) that keeps the version in the API specification file in sync, because that is where the API Gateway reads it as well.

```json
  "scripts": {
    "version": "cross-var node versioning.js $npm_package_version && git add .",
    "postversion": "git push && git push --tags"
  }
```

### Running the CI/CD pipeline

The workflow has been configured to run on pushes to the main branch or pushes of version tags. 

```yaml
on:
  push:
    branches:
      - main
    tags:
      - v*
```

### Updating the development instance

The `update-dev` job has been configured to only run for pushes to the main branch. 

```yaml
  update-dev:
    runs-on: ubuntu-latest
    # only runs against commits to the main branch
    if: github.ref == 'refs/heads/main'
    environment: development
```

The job uses the [Register API action](https://github.com/jiridj/wm-apigw-actions-register-api). The action reads the API name and version from the specification file and applies following logic:
1. If no API exists with this name, create a new API.
2. If the API exists with the specified version, update it. 
3. If the API exists but not with the specified version, a new version is created.

I have set URL for the development gateway instance, and the credentials to access it as [repository secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets). I am reusing the [debugging logging](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/enabling-debug-logging) from GitHub Actions to activate or deactivate the step debug logging as well.  

```yaml
      - uses: jiridj/wm-apigw-actions-register-api@v1
        with: 
          apigw-url: ${{ secrets.APIGW_URL }}
          apigw-username: ${{ secrets.APIGW_USERNAME }}
          apigw-password: ${{ secrets.APIGW_PASSWORD }}
          api-spec: swagger.json
          set-active: true
          debug: ${{ secrets.ACTIONS_STEP_DEBUG }}
```

### Updating the staging instance

The `promote-to-staging` job has been configured to only run for tags. 

```yaml
  promote-to-staging:
    runs-on: ubuntu-latest
    # only run for tags
    if: contains(github.ref, 'refs/tags/')
    environment: staging
```

The job uses the [Promote API action](https://github.com/jiridj/wm-apigw-actions-promote-api). This action uses webMethods API Gateway's [staging and promotion management](https://documentation.softwareag.com/webmethods/compendiums/v10-11/C_API_Management/index.html#page/api-mgmt-comp%2F_soagov_apimgmt_compendium_diba2.1.1045.html%23) capabilities. It takes the name and version of the API to promote and the name of the stage to promote the API to. 

First the name and version are read from the API specification with `jq` and stored in [context variables](https://docs.github.com/en/actions/learn-github-actions/contexts). 

```yaml
      - id: api-info
        run: |
          API_NAME=$(jq '.info.title' swagger.json | tr -d '"')
          API_VERSION=$(jq '.info.version' swagger.json | tr -d '"')
          echo "::set-output name=api-name::${API_NAME}"
          echo "::set-output name=api-version::${API_VERSION}"
```

Then the API is promoted to the `staging` stage using the context variables as input. 

```yaml
      - uses: jiridj/wm-apigw-actions-promote-api@v1
        with: 
          apigw-url: ${{ secrets.APIGW_URL }}
          apigw-username: ${{ secrets.APIGW_USERNAME }}
          apigw-password: ${{ secrets.APIGW_PASSWORD }}
          api-name: ${{ steps.api-info.outputs.api-name }}
          api-version: ${{ steps.api-info.outputs.api-version }}
          stage-name: staging
          debug: ${{ secrets.ACTIONS_STEP_DEBUG }}
```

### Updating production 

Finally, when the update has been [reviewed and approved](https://docs.github.com/en/actions/managing-workflow-runs/reviewing-deployments) the API can be promoted to production. The logic is is pretty much the same as for the staging environment, except that it `needs` the `promote-to-staging` job to be finished successfully before it can run. 

```yaml
  promote-to-production:
    runs-on: ubuntu-latest
    needs: [ promote-to-staging ]
    # only run for tags
    if: contains(github.ref, 'refs/tags/')
    environment: production
```

## What else?

This example only focuses on the actions related to registering and promoting APIs with webMethods API Gateway. These workflows only require an API specification file, either in the repository or via a URL. 

A real-life example would have more complex workflows - for example to build, test and deploy the microservice - before registering or promoting the API within webMethods API Gateway. That is beyond the scope of this example though. 
