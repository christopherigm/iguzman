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

# Create Music Video

> Generate an MP4 video with visualizations for a music track.

### Usage Guide

* This endpoint creates a visual representation of your music track as an MP4 video
* Both taskId and audioId are required to identify the specific track
* Optional author and domainName parameters can be used to add branding

### Developer Notes

1. Generated video files are retained for 15 days
2. Videos include visual effects synchronized with the music
3. This feature is ideal for social media sharing, music promotion, or creating visual content
4. Videos maintain the same audio quality as the original track


## OpenAPI

````yaml /suno-api/suno-api.json POST /api/v1/mp4/generate
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
  /api/v1/mp4/generate:
    post:
      summary: Create Music Video
      operationId: create-music-video
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
                - callBackUrl
              properties:
                taskId:
                  type: string
                  description: >-
                    The task ID of the music generation task.  

                    - Required. This identifies the task containing the audio to
                    be converted to video.  

                    - Both `taskId` and `audioId` are needed to identify the
                    exact track.
                  example: taskId_774b9aa0422f
                audioId:
                  type: string
                  description: >-
                    The ID of the specific track to convert to video.  

                    - Required. This identifies which specific track within the
                    task to convert.  

                    - Both `taskId` and `audioId` are needed to identify the
                    exact track.
                  example: e231****-****-****-****-****8cadc7dc
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive video generation completion
                    notification.  

                    - Required.  

                    - The callback will include a single downloadable URL for
                    the generated MP4 video.

                    - For detailed callback format and implementation guide, see
                    [Music Video Generation
                    Callbacks](https://docs.sunoapi.org/suno-api/create-music-video-callbacks)

                    - Alternatively, you can use the get music video details
                    endpoint to poll task status
                  example: https://api.example.com/callback
                author:
                  type: string
                  maxLength: 50
                  description: >-
                    The artist or creator name to display on the video.  

                    - Optional.  

                    - Will be shown prominently in the video, typically at the
                    beginning.  

                    - Maximum 50 characters.
                  example: Suno Artist
                domainName:
                  type: string
                  maxLength: 50
                  description: >-
                    The website or brand to display as watermark.  

                    - Optional.  

                    - Will appear as a subtle watermark at the bottom of the
                    video.  

                    - Maximum 50 characters.
                  example: music.example.com
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

                          - ⚠️ 409 - Conflict - Mp4 record already exists

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
                            description: Task ID for tracking task status
                            example: taskId_774b9aa0422f
        '500':
          $ref: '#/components/responses/Error'
      callbacks:
        mp4Generated:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when MP4 video generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "MP4 generated successfully.",
                  "data": {
                    "task_id": "taskId_774b9aa0422f",
                    "video_url": "https://example.com/videos/video_847715e66259.mp4"
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
                          example: MP4 generated successfully.
                        data:
                          type: object
                          properties:
                            task_id:
                              type: string
                              description: Task ID
                            video_url:
                              type: string
                              description: Generated MP4 video URL
              responses:
                '200':
                  description: Callback received successfully
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