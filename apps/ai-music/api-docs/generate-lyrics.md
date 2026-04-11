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

# Generate Lyrics

> Create lyrics for music using AI models without generating audio tracks.

### Usage Guide

* This endpoint generates only lyrics content based on your prompt
* Multiple lyrics variations will be returned for you to choose from
* Generated lyrics typically include song structure markers (e.g., \[Verse], \[Chorus])

### Developer Notes

1. Generated lyrics are retained for 15 days
2. Callback has only one stage: complete (generation complete)
3. Use this endpoint when you only need lyrics creation without music
4. Results can be used as input for the Generate Music endpoint in custom mode


## OpenAPI

````yaml /suno-api/suno-api.json POST /api/v1/lyrics
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
  /api/v1/lyrics:
    post:
      summary: Generate Lyrics
      operationId: generate-lyrics
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - prompt
                - callBackUrl
              properties:
                prompt:
                  type: string
                  description: >-
                    Detailed description of the desired lyrics content.  

                    - Be specific about themes, moods, styles, and song
                    structure you want.  

                    - The more detailed your prompt, the more closely the
                    generated lyrics will match your vision.  

                    - The maximum characters limit is 200 characters.
                  example: A song about peaceful night in the city
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive lyrics generation results when
                    complete.  

                    - Required.  

                    - Unlike music generation, lyrics callback has only one
                    stage: `complete` (generation finished).

                    - For detailed callback format and implementation guide, see
                    [Lyrics Generation
                    Callbacks](https://docs.sunoapi.org/suno-api/generate-lyrics-callbacks)

                    - Alternatively, you can use the get lyrics generation
                    details endpoint to poll task status
                  example: https://api.example.com/callback
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
                            description: Task ID for tracking task status
                            example: 5c79****be8e
        '500':
          $ref: '#/components/responses/Error'
      callbacks:
        audioLyricsGenerated:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when lyrics generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "taskId": "11dc****8b0f",
                    "data": [
                      {
                        "text": "[Verse]\n我穿越城市黑暗夜\n心中燃烧梦想的烈火",
                        "title": "钢铁侠",
                        "status": "complete",
                        "errorMessage": ""
                      },
                      {
                        "text": "[Verse]\n风在呼唤我名字\n钢铁盔甲闪得刺眼",
                        "title": "钢铁侠",
                        "status": "complete",
                        "errorMessage": ""
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: Callback type, fixed as complete
                              enum:
                                - complete
                              example: complete
                            taskId:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              description: Generated lyrics list
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
                                    description: Error message, valid when status is failed
              responses:
                '200':
                  description: Callback received successfully
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