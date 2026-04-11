> ## Documentation Index
>
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

# Music Generation Callbacks

> When music generation tasks are completed, the system will send results to your provided callback URL via POST request

When you submit a task to the Music Generation API, you can use the `callBackUrl` parameter to set a callback URL. When the task is completed, the system will automatically push the results to your specified address.

## Callback Mechanism Overview

<Info>
  The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
</Info>

### Callback Timing

The system will send callback notifications in the following situations:

- Music generation task completed successfully
- Music generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl` in the following format:

<CodeGroup>
  ```json Success Callback theme={null}
  {
    "code": 200,
    "msg": "All generated successfully.",
    "data": {
      "callbackType": "complete",
      "task_id": "2fac****9f72",
      "data": [
        {
          "id": "8551****662c",
          "audio_url": "https://example.cn/****.mp3",
          "source_audio_url": "https://example.cn/****.mp3",
          "stream_audio_url": "https://example.cn/****",
          "source_stream_audio_url": "https://example.cn/****",
          "image_url": "https://example.cn/****.jpeg",
          "source_image_url": "https://example.cn/****.jpeg",
          "prompt": "[Verse] Night city lights shining bright",
          "model_name": "chirp-v3-5",
          "title": "Iron Man",
          "tags": "electrifying, rock",
          "createTime": "2025-01-01 00:00:00",
          "duration": 198.44
        },
        {
          "id": "bd15****1873",
          "audio_url": "https://example.cn/****.mp3",
          "source_audio_url": "https://example.cn/****.mp3",
          "stream_audio_url": "https://example.cn/****",
          "source_stream_audio_url": "https://example.cn/****",
          "image_url": "https://example.cn/****.jpeg",
          "source_image_url": "https://example.cn/****.jpeg",
          "prompt": "[Verse] Night city lights shining bright",
          "model_name": "chirp-v3-5",
          "title": "Iron Man",
          "tags": "electrifying, rock",
          "createTime": "2025-01-01 00:00:00",
          "duration": 228.28
        }
      ]
    }
  }
  ```

```json Failure Callback theme={null}
{
  "code": 400,
  "msg": "Music generation failed",
  "data": {
    "callbackType": "error",
    "task_id": "2fac****9f72",
    "data": null
  }
}
```

</CodeGroup>

## Status Code Description

<ParamField path="code" type="integer" required>
  Callback status code indicating task processing result:

| Status Code | Description                                            |
| ----------- | ------------------------------------------------------ |
| 200         | Success - Music generation completed                   |
| 400         | Bad Request - Parameter error, content violation, etc. |
| 451         | Download Failed - Unable to download related files     |
| 500         | Server Error - Please try again later                  |

</ParamField>

<ParamField path="msg" type="string" required>
  Status message providing detailed status description
</ParamField>

<ParamField path="data.callbackType" type="string" required>
  Callback type indicating the current callback stage:

- `text`: Text generation completed
- `first`: First music track completed
- `complete`: All music tracks completed
- `error`: Task failed
  </ParamField>

<ParamField path="data.task_id" type="string" required>
  Task ID, consistent with the taskId returned when you submitted the task
</ParamField>

<ParamField path="data.data" type="array">
  Music generation result information, returned on success
</ParamField>

<ParamField path="data.data[].id" type="string">
  Music unique identifier
</ParamField>

<ParamField path="data.data[].audio_url" type="string">
  Generated audio file URL
</ParamField>

<ParamField path="data.data[].source_audio_url" type="string">
  Original audio file URL
</ParamField>

<ParamField path="data.data[].stream_audio_url" type="string">
  Streaming audio URL
</ParamField>

<ParamField path="data.data[].source_stream_audio_url" type="string">
  Original streaming audio URL
</ParamField>

<ParamField path="data.data[].image_url" type="string">
  Cover image URL
</ParamField>

<ParamField path="data.data[].source_image_url" type="string">
  Original cover image URL
</ParamField>

<ParamField path="data.data[].prompt" type="string">
  Generation prompt/lyrics
</ParamField>

<ParamField path="data.data[].model_name" type="string">
  Model name used
</ParamField>

<ParamField path="data.data[].title" type="string">
  Music title
</ParamField>

<ParamField path="data.data[].tags" type="string">
  Music tags
</ParamField>

<ParamField path="data.data[].createTime" type="string">
  Creation time
</ParamField>

<ParamField path="data.data[].duration" type="number">
  Audio duration (seconds)
</ParamField>

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <Tab title="Node.js">
    ```javascript  theme={null}
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/generate-music-callback', (req, res) => {
      const { code, msg, data } = req.body;

      console.log('Received music generation callback:', {
        taskId: data.task_id,
        callbackType: data.callbackType,
        status: code,
        message: msg
      });

      if (code === 200) {
        // Task completed successfully
        console.log('Music generation completed');
        const musicData = data.data || [];

        console.log(`Generated ${musicData.length} music tracks:`);
        musicData.forEach((music, index) => {
          console.log(`Music ${index + 1}:`);
          console.log(`  Title: ${music.title}`);
          console.log(`  Duration: ${music.duration} seconds`);
          console.log(`  Tags: ${music.tags}`);
          console.log(`  Audio URL: ${music.audio_url}`);
          console.log(`  Cover URL: ${music.image_url}`);
        });

        // Process generated music
        // Can download audio files, save locally, etc.

      } else {
        // Task failed
        console.log('Music generation failed:', msg);

        // Handle failure cases...
        if (code === 400) {
          console.log('Parameter error or content violation');
        } else if (code === 451) {
          console.log('File download failed');
        } else if (code === 500) {
          console.log('Server internal error');
        }
      }

      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```

  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    from flask import Flask, request, jsonify
    import requests

    app = Flask(__name__)

    @app.route('/generate-music-callback', methods=['POST'])
    def handle_callback():
        data = request.json

        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        callback_type = callback_data.get('callbackType')
        music_data = callback_data.get('data', [])

        print(f"Received music generation callback: {task_id}, type: {callback_type}, status: {code}, message: {msg}")

        if code == 200:
            # Task completed successfully
            print("Music generation completed")

            print(f"Generated {len(music_data)} music tracks:")
            for i, music in enumerate(music_data):
                print(f"Music {i + 1}:")
                print(f"  Title: {music.get('title')}")
                print(f"  Duration: {music.get('duration')} seconds")
                print(f"  Tags: {music.get('tags')}")
                print(f"  Audio URL: {music.get('audio_url')}")
                print(f"  Cover URL: {music.get('image_url')}")

                # Download audio file example
                try:
                    audio_url = music.get('audio_url')
                    if audio_url:
                        response = requests.get(audio_url)
                        if response.status_code == 200:
                            filename = f"generated_music_{task_id}_{i + 1}.mp3"
                            with open(filename, "wb") as f:
                                f.write(response.content)
                            print(f"Audio saved as {filename}")
                except Exception as e:
                    print(f"Audio download failed: {e}")

        else:
            # Task failed
            print(f"Music generation failed: {msg}")

            # Handle failure cases...
            if code == 400:
                print("Parameter error or content violation")
            elif code == 451:
                print("File download failed")
            elif code == 500:
                print("Server internal error")

        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```

  </Tab>

  <Tab title="PHP">
    ```php  theme={null}
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $callbackType = $callbackData['callbackType'] ?? '';
    $musicData = $callbackData['data'] ?? [];

    error_log("Received music generation callback: $taskId, type: $callbackType, status: $code, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        error_log("Music generation completed");

        error_log("Generated " . count($musicData) . " music tracks:");
        foreach ($musicData as $index => $music) {
            error_log("Music " . ($index + 1) . ":");
            error_log("  Title: " . ($music['title'] ?? ''));
            error_log("  Duration: " . ($music['duration'] ?? 0) . " seconds");
            error_log("  Tags: " . ($music['tags'] ?? ''));
            error_log("  Audio URL: " . ($music['audio_url'] ?? ''));
            error_log("  Cover URL: " . ($music['image_url'] ?? ''));

            // Download audio file example
            try {
                $audioUrl = $music['audio_url'] ?? '';
                if ($audioUrl) {
                    $audioContent = file_get_contents($audioUrl);
                    if ($audioContent !== false) {
                        $filename = "generated_music_{$taskId}_" . ($index + 1) . ".mp3";
                        file_put_contents($filename, $audioContent);
                        error_log("Audio saved as $filename");
                    }
                }
            } catch (Exception $e) {
                error_log("Audio download failed: " . $e->getMessage());
            }
        }

    } else {
        // Task failed
        error_log("Music generation failed: $msg");

        // Handle failure cases...
        if ($code === 400) {
            error_log("Parameter error or content violation");
        } elseif ($code === 451) {
            error_log("File download failed");
        } elseif ($code === 500) {
            error_log("Server internal error");
        }
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```

  </Tab>
</Tabs>

## Best Practices

<Tip>
  ### Callback URL Configuration Recommendations

1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same taskId may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Audio Processing**: Audio download and processing should be done in asynchronous tasks to avoid blocking callback response
   </Tip>

<Warning>
  ### Important Reminders

- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Generated audio URLs may have time limits, recommend downloading and saving promptly
- Pay attention to content policy compliance to avoid generation failures due to policy violations
  </Warning>

## Troubleshooting

If you do not receive callback notifications, please check the following:

<AccordionGroup>
  <Accordion title="Network Connection Issues">
    * Confirm that the callback URL is accessible from the public network
    * Check firewall settings to ensure inbound requests are not blocked
    * Verify that domain name resolution is correct
  </Accordion>

  <Accordion title="Server Response Issues">
    * Ensure the server returns HTTP 200 status code within 15 seconds
    * Check server logs for error messages
    * Verify that the interface path and HTTP method are correct
  </Accordion>

  <Accordion title="Content Format Issues">
    * Confirm that the received POST request body is in JSON format
    * Check that Content-Type is application/json
    * Verify that JSON parsing is correct
  </Accordion>

  <Accordion title="Audio Processing Issues">
    * Confirm that audio URLs are accessible
    * Check audio download permissions and network connections
    * Verify audio save paths and permissions
    * Note whether audio content complies with content policies
  </Accordion>
</AccordionGroup>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card title="Poll Query Results" icon="radar" href="/suno-api/get-music-generation-details">
  Use the get music generation details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>

Built with [Mintlify](https://mintlify.com).
