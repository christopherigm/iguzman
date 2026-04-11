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

# Replace Music Section Callbacks

> Understand the callback mechanism for replace music section tasks

When you submit a replace music section task to the API, you can provide a `callBackUrl` to receive real-time notifications about task progress and completion.

## Callback Mechanism

### When Callbacks Are Sent

The system sends callbacks at the following times:

* **Complete**: When the replacement task is fully completed

### Callback Method

* **HTTP Method**: POST
* **Content-Type**: application/json
* **Timeout**: 10 seconds
* **Retry Policy**: Up to 3 attempts with exponential backoff

## Request Format

### Success Callback

When the replacement task completes successfully:

```json  theme={null}
{
  "code": 200,
  "msg": "All generated successfully.",
  "data": {
    "callbackType": "complete",
    "task_id": "2fac****9f72",
    "data": [
      {
        "id": "e231****-****-****-****-****8cadc7dc",
        "audio_url": "https://example.cn/****.mp3",
        "stream_audio_url": "https://example.cn/****",
        "image_url": "https://example.cn/****.jpeg",
        "prompt": "A calm and relaxing piano track.",
        "model_name": "chirp-v3-5",
        "title": "Relaxing Piano",
        "tags": "Jazz",
        "createTime": "2025-01-01 00:00:00",
        "duration": 198.44
      }
    ]
  }
}
```

### Failure Callback

When the replacement task fails:

```json  theme={null}
{
  "code": 501,
  "msg": "Audio generation failed.",
  "data": {
    "callbackType": "error",
    "task_id": "2fac****9f72",
    "error": "Generation failed due to technical issues"
  }
}
```

## Status Codes

| Code | Description                                        |
| ---- | -------------------------------------------------- |
| 200  | Success - Task completed successfully              |
| 400  | Validation error - Parameter validation failed     |
| 408  | Timeout - Request timeout                          |
| 500  | Server error - Unexpected error occurred           |
| 501  | Audio generation failed                            |
| 531  | Server error - Generation failed, credits refunded |

## Response Fields

### Success Response Fields

<ResponseField name="code" type="integer" required>
  Status code indicating the result of the replacement task
</ResponseField>

<ResponseField name="msg" type="string" required>
  Status message describing the result
</ResponseField>

<ResponseField name="data" type="object" required>
  Container for callback data

  <Expandable title="Data object properties">
    <ResponseField name="callbackType" type="string" required>
      Type of callback: `complete` or `error`
    </ResponseField>

    <ResponseField name="task_id" type="string" required>
      The task ID for the replacement request
    </ResponseField>

    <ResponseField name="data" type="array">
      Array of replaced music data (only present on success)

      <Expandable title="Music data properties">
        <ResponseField name="id" type="string">
          Unique identifier for the music segment
        </ResponseField>

        <ResponseField name="audio_url" type="string">
          Direct URL to the audio file
        </ResponseField>

        <ResponseField name="stream_audio_url" type="string">
          Streaming URL for the audio
        </ResponseField>

        <ResponseField name="image_url" type="string">
          URL to the cover image
        </ResponseField>

        <ResponseField name="prompt" type="string">
          The prompt used for generating the replacement
        </ResponseField>

        <ResponseField name="model_name" type="string">
          Name of the AI model used
        </ResponseField>

        <ResponseField name="title" type="string">
          Title of the music
        </ResponseField>

        <ResponseField name="tags" type="string">
          Style tags for the music
        </ResponseField>

        <ResponseField name="createTime" type="string">
          Creation timestamp
        </ResponseField>

        <ResponseField name="duration" type="number">
          Duration of the audio in seconds
        </ResponseField>
      </Expandable>
    </ResponseField>
  </Expandable>
</ResponseField>

## Implementation Examples

### Node.js (Express)

```javascript  theme={null}
const express = require('express');
const app = express();

app.use(express.json());

app.post('/replace-section-callback', (req, res) => {
  const { code, msg, data } = req.body;
  
  console.log('Replace section callback received:', {
    code,
    msg,
    taskId: data.task_id,
    callbackType: data.callbackType
  });
  
  if (code === 200 && data.callbackType === 'complete') {
    // Handle successful replacement
    console.log('Replacement completed successfully');
    data.data.forEach((music, index) => {
      console.log(`Music ${index + 1}:`, {
        id: music.id,
        title: music.title,
        duration: music.duration,
        audioUrl: music.audio_url
      });
    });
  } else {
    // Handle failure
    console.log('Replacement failed:', msg);
  }
  
  // Always respond with success to acknowledge receipt
  res.json({ code: 200, msg: 'success' });
});

app.listen(3000, () => {
  console.log('Callback server running on port 3000');
});
```

### Python (Flask)

```python  theme={null}
from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/replace-section-callback', methods=['POST'])
def replace_section_callback():
    data = request.json
    code = data.get('code')
    msg = data.get('msg')
    callback_data = data.get('data', {})
    
    logging.info(f"Replace section callback received: code={code}, msg={msg}")
    
    if code == 200 and callback_data.get('callbackType') == 'complete':
        # Handle successful replacement
        logging.info("Replacement completed successfully")
        music_data = callback_data.get('data', [])
        for i, music in enumerate(music_data):
            logging.info(f"Music {i + 1}: {music.get('title')} - {music.get('duration')}s")
    else:
        # Handle failure
        logging.error(f"Replacement failed: {msg}")
    
    # Always respond with success
    return jsonify({"code": 200, "msg": "success"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)
```

### PHP

```php  theme={null}
<?php
header('Content-Type: application/json');

// Get the raw POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if ($data === null) {
    http_response_code(400);
    echo json_encode(['code' => 400, 'msg' => 'Invalid JSON']);
    exit;
}

$code = $data['code'] ?? null;
$msg = $data['msg'] ?? '';
$callbackData = $data['data'] ?? [];

error_log("Replace section callback received: code=$code, msg=$msg");

if ($code === 200 && ($callbackData['callbackType'] ?? '') === 'complete') {
    // Handle successful replacement
    error_log("Replacement completed successfully");
    $musicData = $callbackData['data'] ?? [];
    foreach ($musicData as $index => $music) {
        $title = $music['title'] ?? 'Unknown';
        $duration = $music['duration'] ?? 0;
        error_log("Music " . ($index + 1) . ": $title - {$duration}s");
    }
} else {
    // Handle failure
    error_log("Replacement failed: $msg");
}

// Always respond with success
echo json_encode(['code' => 200, 'msg' => 'success']);
?>
```

## Callback Security

### Verification Recommendations

1. **IP Whitelist**: Restrict callback endpoints to known IP addresses
2. **HTTPS Only**: Always use HTTPS for callback URLs in production
3. **Request Validation**: Validate the structure and content of callback requests
4. **Timeout Handling**: Implement proper timeout handling for callback processing

### Example Security Implementation

```javascript  theme={null}
const crypto = require('crypto');

function verifyCallback(req, res, next) {
  // Verify request structure
  const { code, msg, data } = req.body;
  if (typeof code !== 'number' || typeof msg !== 'string' || !data) {
    return res.status(400).json({ code: 400, msg: 'Invalid callback format' });
  }
  
  // Verify task ID format
  const taskId = data.task_id;
  if (!taskId || !/^[a-f0-9\*]{12}$/.test(taskId)) {
    return res.status(400).json({ code: 400, msg: 'Invalid task ID' });
  }
  
  next();
}

app.post('/replace-section-callback', verifyCallback, (req, res) => {
  // Process verified callback
  // ... callback handling logic
});
```

## Troubleshooting

### Common Issues

**Q: Callbacks are not being received**

* Verify your callback URL is publicly accessible
* Check that your server is responding within 10 seconds
* Ensure your endpoint accepts POST requests with JSON content

**Q: Receiving duplicate callbacks**

* This can happen due to network issues or timeouts
* Implement idempotency using the task\_id to handle duplicates

**Q: Callback data is missing or incomplete**

* Check the `callbackType` field to understand the callback stage
* For error callbacks, check the error message for details

**Q: How to handle callback failures?**

* Always return a 200 status code to acknowledge receipt
* Use the [Get Music Details](./get-music-details) endpoint to poll task status as a fallback

### Best Practices

1. **Always Acknowledge**: Return HTTP 200 even if your processing fails
2. **Implement Retry Logic**: Handle temporary failures gracefully
3. **Log Everything**: Keep detailed logs for debugging
4. **Use Fallback Polling**: Don't rely solely on callbacks for critical workflows
5. **Validate Data**: Always validate callback data before processing


Built with [Mintlify](https://mintlify.com).