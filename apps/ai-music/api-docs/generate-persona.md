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

# Generate Persona

> Create a personalized music Persona based on generated music, giving the music a unique identity and characteristics.

### Usage Guide

* Use this endpoint to create Personas (music characters) for generated music
* Requires the taskId from music generation related endpoints (generate, extend, cover, upload-extend, mashup) and audio ID
* Customize the Persona name and description to give music unique personality
* Generated Personas can be used for subsequent music creation and style transfer
* Optionally specify vocalStart and vocalEnd to define the time range (10-30 seconds) for analysis. If not provided, defaults to 0.0 and 30.0 respectively

### Parameter Details

* `taskId`: Required parameter, can be obtained from the following endpoints:
  * [Generate Music](./generate-music) (`/api/v1/generate`)
  * [Extend Music](./extend-music) (`/api/v1/generate/extend`)
  * [Upload And Cover Audio](./upload-and-cover-audio) (`/api/v1/generate/upload-cover`)
  * [Upload And Extend Audio](./upload-and-extend-audio) (`/api/v1/generate/upload-extend`)
* `audioId`: Required parameter, specifies the audio ID to create Persona for
* `name`: Required parameter, assigns an easily recognizable name to the Persona
* `description`: Required parameter, describes the Persona's musical characteristics, style, and personality
* `vocalStart`: Optional parameter, start time (in seconds) of the audio segment to analyze. Default value is 0.0. Must be between 0 and the audio duration, and the segment length (vocalEnd - vocalStart) must be between 10-30 seconds.
* `vocalEnd`: Optional parameter, end time (in seconds) of the audio segment to analyze. Default value is 30.0. Must be between 0 and the audio duration, and the segment length (vocalEnd - vocalStart) must be between 10-30 seconds.
* `style`: Optional parameter, music style label to help categorize the Persona

### Developer Notes

* **Important**: Ensure the music generation task is fully completed before calling this endpoint. If the music is still generating, this endpoint will return a failure
* **Model Requirement**: Persona generation supports taskId from music generated with models V4 and above
* It is recommended to provide detailed descriptions for Personas to better capture musical characteristics
* The returned `personaId` can be used in subsequent music generation requests to create music with similar style characteristics
* You can apply the `personaId` to the following endpoints:
  * [Generate Music](./generate-music)
  * [Extend Music](./extend-music)
  * [Upload And Cover Audio](./upload-and-cover-audio)
  * [Upload And Extend Audio](./upload-and-extend-audio)
* Each audio ID can only generate a Persona once

### Parameter Example

<CodeGroup>
  ```json With Default Values theme={null}
  {
    "taskId": "5c79****be8e",
    "audioId": "e231****-****-****-****-****8cadc7dc",
    "name": "Electronic Pop Singer",
    "description": "A modern electronic music style pop singer, skilled in dynamic rhythms and synthesizer tones",
    "style": "Electronic Pop"
  }
  ```

  ```json With Custom Time Range theme={null}
  {
    "taskId": "5c79****be8e",
    "audioId": "e231****-****-****-****-****8cadc7dc",
    "name": "Electronic Pop Singer",
    "description": "A modern electronic music style pop singer, skilled in dynamic rhythms and synthesizer tones",
    "vocalStart": 10,
    "vocalEnd": 30,
    "style": "Electronic Pop"
  }
  ```
</CodeGroup>

<Note>
  Ensure that the music generation task corresponding to the taskId is complete and the audioId is valid.
</Note>

<Tip>
  Providing detailed and specific descriptions for Personas helps the system more accurately capture musical style characteristics.
</Tip>


## OpenAPI

````yaml /suno-api/suno-api.json POST /api/v1/generate/generate-persona
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
  /api/v1/generate/generate-persona:
    post:
      tags:
        - Music Generation
      summary: Generate Persona
      operationId: generate-persona
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
                - name
                - description
              properties:
                taskId:
                  type: string
                  description: >
                    Unique identifier of the original music generation task.
                    This can be a taskId returned from any of the following
                    endpoints:

                    - Generate Music (/api/v1/generate)

                    - Extend Music (/api/v1/generate/extend)

                    - Upload And Cover Audio (/api/v1/generate/upload-cover)

                    - Upload And Extend Audio (/api/v1/generate/upload-extend)
                  example: 5c79****be8e
                audioId:
                  type: string
                  description: Audio ID of the music track to create Persona for.
                  example: e231****-****-****-****-****8cadc7dc
                name:
                  type: string
                  description: >-
                    Name for the Persona. A descriptive name that captures the
                    essence of the musical style or character.
                  example: Electronic Pop Singer
                description:
                  type: string
                  description: >-
                    Detailed description of the Persona's musical
                    characteristics, style, and personality. Be specific about
                    genre, mood, instrumentation, and vocal qualities.
                  example: >-
                    A modern electronic music style pop singer, skilled in
                    dynamic rhythms and synthesizer tones
                vocalStart:
                  type: number
                  description: >-
                    Start time (in seconds) of the audio segment to analyze for
                    Persona generation. Optional. Default value is 0.0. Must be
                    between 0 and the audio duration. The segment length
                    (vocalEnd - vocalStart) must be between 10-30 seconds.
                  minimum: 0
                  default: 0
                  example: 0
                vocalEnd:
                  type: number
                  description: >-
                    End time (in seconds) of the audio segment to analyze for
                    Persona generation. Optional. Default value is 30.0. Must be
                    between 0 and the audio duration. The segment length
                    (vocalEnd - vocalStart) must be between 10-30 seconds.
                  minimum: 0
                  default: 30
                  example: 30
                style:
                  type: string
                  description: Music style label to help categorize the Persona. Optional.
                  example: Electronic Pop
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
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response Status Codes


                          - **200**: Success - Request has been processed
                          successfully  

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid  

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation  

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist  

                          - **409**: Conflict - Persona already exists for this
                          music

                          - **422**: Validation Error - The request parameters
                          failed validation checks  

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource  

                          - **451**: Unauthorized - Failed to fetch the music
                          data. Kindly verify any access limits set by you or
                          your service provider  

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance  

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        example: success
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          personaId:
                            type: string
                            description: >-
                              Unique identifier for the generated Persona. This
                              personaId can be used in subsequent music
                              generation requests (Generate Music, Extend Music,
                              Upload And Cover Audio, Upload And Extend Audio)
                              to create music with similar style
                              characteristics.
                            example: a1b2****c3d4
                          name:
                            type: string
                            description: Name of the Persona as provided in the request.
                            example: Electronic Pop Singer
                          description:
                            type: string
                            description: >-
                              Description of the Persona's musical
                              characteristics, style, and personality as
                              provided in the request.
                            example: >-
                              A modern electronic music style pop singer,
                              skilled in dynamic rhythms and synthesizer tones
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