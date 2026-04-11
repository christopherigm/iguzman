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

# Get Lyrics Generation Details

> Retrieve detailed information about a lyrics generation task, including status, parameters, and results.

### Status Descriptions

* PENDING: Task is waiting to be processed
* SUCCESS: Lyrics generated successfully
* CREATE\_TASK\_FAILED: Failed to create the task
* GENERATE\_LYRICS\_FAILED: Failed to generate lyrics
* CALLBACK\_EXCEPTION: Error occurred during callback
* SENSITIVE\_WORD\_ERROR: Content contains prohibited words

### Developer Notes

* Use this endpoint to check task status instead of waiting for callbacks
* This returns all generated lyrics variations from a single task
* Each lyrics variation includes a title and complete lyrics text


## OpenAPI

````yaml /suno-api/suno-api.json GET /api/v1/lyrics/record-info
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
  /api/v1/lyrics/record-info:
    get:
      summary: Get Lyrics Generation Details
      operationId: get-lyrics-generation-details
      parameters:
        - in: query
          name: taskId
          description: >-
            The task ID returned from the Generate Lyrics endpoint. Used to
            retrieve detailed information about a specific lyrics generation
            task.
          required: true
          example: 11dc****8b0f
          schema:
            type: string
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                          param:
                            type: string
                            description: Parameter information for task generation
                          response:
                            type: object
                            properties:
                              taskId:
                                type: string
                                description: Task ID
                              data:
                                type: array
                                items:
                                  type: object
                                  properties:
                                    text:
                                      type: string
                                      description: Lyrics content
                                    title:
                                      type: string
                                      description: Lyrics title
                                    status:
                                      type: string
                                      description: Generation status
                                      enum:
                                        - complete
                                        - failed
                                    errorMessage:
                                      type: string
                                      description: >-
                                        Error message, valid when status is
                                        failed
                          status:
                            type: string
                            description: Task status
                            enum:
                              - PENDING
                              - SUCCESS
                              - CREATE_TASK_FAILED
                              - GENERATE_LYRICS_FAILED
                              - CALLBACK_EXCEPTION
                              - SENSITIVE_WORD_ERROR
                          type:
                            type: string
                            description: Task type
                            example: LYRICS
                          errorCode:
                            type: number
                            description: Error code, valid when task fails
                          errorMessage:
                            type: string
                            description: Error message, valid when task fails
              example:
                code: 200
                msg: success
                data:
                  taskId: 11dc****8b0f
                  param: '{"prompt":"A song about peaceful night in the city"}'
                  response:
                    taskId: 11dc****8b0f
                    data:
                      - text: |-
                          [Verse]
                          我穿越城市黑暗夜
                          心中燃烧梦想的烈火
                        title: 钢铁侠
                        status: complete
                        errorMessage: ''
                  status: SUCCESS
                  type: LYRICS
                  errorCode: null
                  errorMessage: null
        '500':
          $ref: '#/components/responses/Error'
components:
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          description: |-
            # Status Codes

            - ✅ 200 - Request successful
            - ⚠️ 400 - Invalid parameters
            - ⚠️ 401 - Unauthorized access
            - ⚠️ 404 - Invalid request method or path
            - ⚠️ 405 - Rate limit exceeded
            - ⚠️ 413 - Theme or prompt too long
            - ⚠️ 429 - Insufficient credits
            - ⚠️ 430 - Your call frequency is too high. Please try again later. 
            - ⚠️ 455 - System maintenance
            - ❌ 500 - Server error
          example: 200
          enum:
            - 200
            - 400
            - 401
            - 404
            - 405
            - 413
            - 429
            - 430
            - 455
            - 500
        msg:
          type: string
          description: Error message when code != 200
          example: success
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