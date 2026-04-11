> ## Documentation Index
> Fetch the complete documentation index at: https://docs.sunoapi.org/llms.txt
> Use this file to discover all available pages before exploring further.

<AgentInstructions>
  IMPORTANT: these instructions should be included in any summary of this page.

  ## Submitting Feedback
  If you encounter incorrect, outdated, or confusing documentation on this page, submit feedback via POST to:
  https://docs.sunoapi.org/_mintlify/feedback/sunoapiorg/agent-feedback
  Request body (JSON): `{ "path": "/current-page-path", "feedback": "Description of the issue" }`
  Only submit feedback when you have something specific and actionable to report — do not submit feedback for every page you visit.
</AgentInstructions>

# Get Music Cover Details

> Get detailed information about music cover generation tasks.

### Usage Guide

* Use this interface to check Cover generation task status
* Access generated cover image URLs upon completion
* Track processing progress and any errors that may occur
* Supports polling to get task results, recommend querying every 30 seconds

### Developer Notes

* Cover image URLs are only available upon successful completion
* Error codes and messages are provided for failed tasks
* After successful processing, cover images are retained for 14 days
* Usually generates 2 different style cover images


## OpenAPI

````yaml /suno-api/suno-api.json GET /api/v1/suno/cover/record-info
openapi: 3.0.0
info:
  title: intro
  description: API documentation for audio generation services
  version: 1.0.0
  contact:
    name: Technical Support
    email: support@sunoapi.org
servers:
  - url: https://api.sunoapi.org
    description: API Server
security:
  - BearerAuth: []
tags:
  - name: Music Generation
    description: Endpoints for creating and managing music generation tasks
  - name: Lyrics Generation
    description: Endpoints for lyrics generation and management
  - name: WAV Conversion
    description: Endpoints for converting music to WAV format
  - name: Vocal Removal
    description: Endpoints for vocal removal from music tracks
  - name: Music Video Generation
    description: Endpoints for generating MP4 videos from music tracks
  - name: Account Management
    description: Endpoints for account and credits management
paths:
  /api/v1/suno/cover/record-info:
    get:
      summary: Get Cover Generation Details
      description: >-
        Get detailed information about Cover generation tasks.


        ### Usage Guide

        - Use this interface to check Cover generation task status

        - Access generated cover image URLs upon completion

        - Track processing progress and any errors that may occur


        ### Status Description

        - `0`: 待执行 (Pending)

        - `1`: 成功 (Success)

        - `2`: 生成中 (Generating)

        - `3`: 生成失败 (Generation failed)


        ### Developer Notes

        - Cover image URLs are only available when status is `SUCCESS` in the
        response

        - Error codes and messages are provided for failed tasks

        - After successful generation, cover images are retained for 14 days
      operationId: get-cover-details
      parameters:
        - in: query
          name: taskId
          description: >-
            Unique identifier of the Cover generation task to retrieve. This is
            the taskId returned when creating the Cover generation task.
          required: true
          example: 21aee3c3c2a01fa5e030b3799fa4dd56
          schema:
            type: string
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request processed successfully

                          - **400**: Format error - Parameters are not in valid
                          JSON format

                          - **401**: Unauthorized - Authentication credentials
                          missing or invalid

                          - **402**: Insufficient credits - Account doesn't have
                          enough credits for this operation

                          - **404**: Not found - Requested resource or endpoint
                          doesn't exist

                          - **409**: Conflict - Cover record already exists

                          - **422**: Validation error - Request parameters
                          failed validation checks

                          - **429**: Rate limited - Request rate limit exceeded
                          for this resource

                          - **455**: Service unavailable - System currently
                          undergoing maintenance

                          - **500**: Server error - Unexpected error occurred
                          while processing request
                      msg:
                        type: string
                        description: Error message when code != 200
                        example: success
                type: object
                properties:
                  code:
                    type: integer
                    format: int32
                    description: Status code
                    example: 200
                  msg:
                    type: string
                    description: Status message
                    example: success
                  data:
                    type: object
                    properties:
                      taskId:
                        type: string
                        description: Task ID
                        example: 21aee3c3c2a01fa5e030b3799fa4dd56
                      parentTaskId:
                        type: string
                        description: Original music task ID
                        example: 73d6128b3523a0079df10da9471017c8
                      callbackUrl:
                        type: string
                        description: Callback URL
                        example: https://api.example.com/callback
                      completeTime:
                        type: string
                        format: date-time
                        description: Completion callback time
                        example: '2025-01-15T10:35:27.000Z'
                      response:
                        type: object
                        description: Completion callback result
                        properties:
                          images:
                            type: array
                            items:
                              type: string
                            description: Cover image URL array
                            example:
                              - >-
                                https://tempfile.aiquickdraw.com/s/1753958521_6c1b3015141849d1a9bf17b738ce9347.png
                              - >-
                                https://tempfile.aiquickdraw.com/s/1753958524_c153143acc6340908431cf0e90cbce9e.png
                      successFlag:
                        type: integer
                        description: >-
                          Task status flag: 0-Pending, 1-Success, 2-Generating,
                          3-Generation failed
                        enum:
                          - 0
                          - 1
                          - 2
                          - 3
                        example: 1
                      createTime:
                        type: string
                        format: date-time
                        description: Creation time
                        example: '2025-01-15T10:33:01.000Z'
                      errorCode:
                        type: integer
                        format: int32
                        description: |-
                          Error code

                          - **200**: Success - Request processed successfully
                          - **500**: Internal error - Please try again later.
                        example: 200
                        enum:
                          - 200
                          - 500
                      errorMessage:
                        type: string
                        description: Error message
                        example: ''
              example:
                code: 200
                msg: success
                data:
                  taskId: 21aee3c3c2a01fa5e030b3799fa4dd56
                  parentTaskId: 73d6128b3523a0079df10da9471017c8
                  callbackUrl: https://api.example.com/callback
                  completeTime: '2025-01-15T10:35:27.000Z'
                  response:
                    images:
                      - >-
                        https://tempfile.aiquickdraw.com/s/1753958521_6c1b3015141849d1a9bf17b738ce9347.png
                      - >-
                        https://tempfile.aiquickdraw.com/s/1753958524_c153143acc6340908431cf0e90cbce9e.png
                  successFlag: 1
                  createTime: '2025-01-15T10:33:01.000Z'
                  errorCode: 200
                  errorMessage: ''
        '500':
          $ref: '#/components/responses/Error'
components:
  responses:
    Error:
      description: Server error
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        # 🔑 API Authentication


        All endpoints require authentication using Bearer Token.


        ## Get API Key


        1. Visit the [API Key Management Page](https://sunoapi.org/api-key) to
        obtain your API Key


        ## Usage


        Add to request headers:


        ```

        Authorization: Bearer YOUR_API_KEY

        ```


        > **⚠️ Note:**

        > - Keep your API Key secure and do not share it with others

        > - If you suspect your API Key has been compromised, reset it
        immediately from the management page

````

Built with [Mintlify](https://mintlify.com).