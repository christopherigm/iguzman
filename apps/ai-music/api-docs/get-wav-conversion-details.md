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

# Get WAV Conversion Details

> Retrieve detailed information about a WAV format conversion task, including status and download link.

### Status Descriptions

* PENDING: Task is waiting to be processed
* SUCCESS: WAV conversion completed successfully
* CREATE\_TASK\_FAILED: Failed to create the conversion task
* GENERATE\_WAV\_FAILED: Failed to convert to WAV format
* CALLBACK\_EXCEPTION: Error occurred during callback

### Developer Notes

* Use this endpoint to check conversion status instead of waiting for callbacks
* The response includes the WAV file download URL when status is SUCCESS
* Task creation and completion times are included in the response


## OpenAPI

````yaml /suno-api/suno-api.json GET /api/v1/wav/record-info
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
  /api/v1/wav/record-info:
    get:
      summary: Get WAV Conversion Details
      operationId: get-wav-conversion-details
      parameters:
        - in: query
          name: taskId
          description: >-
            The task ID returned from the Convert to WAV Format endpoint. Used
            to retrieve details about the conversion process, including status
            and download URL if available.
          required: true
          example: 988e****c8d3
          schema:
            type: string
      responses:
        '200':
          description: Request successful
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
                          - 404
                          - 405
                          - 409
                          - 413
                          - 429
                          - 430
                          - 455
                          - 500
                        description: >-
                          # Status Codes


                          - ✅ 200 - Request successful

                          - ⚠️ 400 - Invalid parameters

                          - ⚠️ 401 - Unauthorized access

                          - ⚠️ 404 - Invalid request method or path

                          - ⚠️ 405 - Rate limit exceeded

                          - ⚠️ 409 - Conflict - WAV record already exists

                          - ⚠️ 413 - Theme or prompt too long

                          - ⚠️ 429 - Insufficient credits

                          - ⚠️ 430 - Your call frequency is too high. Please try
                          again later. 

                          - ⚠️ 455 - System maintenance

                          - ❌ 500 - Server error
                      msg:
                        type: string
                        description: Error message when code != 200
                        example: success
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                          musicId:
                            type: string
                            description: >-
                              The ID of the source music track that was
                              converted to WAV format
                          musicIndex:
                            type: integer
                            description: Music index, 0 or 1
                            example: 0
                          callbackUrl:
                            type: string
                            description: >-
                              The callback URL that was provided in the
                              conversion request
                          completeTime:
                            type: string
                            description: The timestamp when the conversion was completed
                            format: date-time
                          response:
                            type: object
                            properties:
                              audioWavUrl:
                                type: string
                                description: WAV format audio file URL
                          successFlag:
                            type: string
                            description: Task status
                            enum:
                              - PENDING
                              - SUCCESS
                              - CREATE_TASK_FAILED
                              - GENERATE_WAV_FAILED
                              - CALLBACK_EXCEPTION
                          createTime:
                            type: string
                            description: Creation time
                            format: date-time
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
                  taskId: 988e****c8d3
                  musicId: 8551****662c
                  musicIndex: 0
                  callbackUrl: https://api.example.com/callback
                  completeTime: '2025-01-01 00:10:00'
                  response:
                    audioWavUrl: https://example.com/s/04e6****e727.wav
                  successFlag: SUCCESS
                  createTime: '2025-01-01 00:00:00'
                  errorCode: null
                  errorMessage: null
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