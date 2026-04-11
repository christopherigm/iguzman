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

# WAV Format Conversion Callbacks

> When WAV format conversion tasks are completed, the system will send results to your provided callback URL via POST request

When you submit a task to the WAV Format Conversion API, you can use the `callBackUrl` parameter to set a callback URL. When the task is completed, the system will automatically push the results to your specified address.

## Callback Mechanism Overview

<Info>
  The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
</Info>

### Callback Timing

The system will send callback notifications in the following situations:

* WAV format conversion task completed successfully
* WAV format conversion task failed
* Errors occurred during task processing

### Callback Method

* **HTTP Method**: POST
* **Content Type**: application/json
* **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl` in the following format:

<CodeGroup>
  ```json Success Callback theme={null}
  {
    "code": 200,
    "msg": "success",
    "data": {
      "audioWavUrl": "https://example.com/s/04e6****e727.wav",
      "task_id": "988e****c8d3"
    }
  }
  ```

  ```json Failure Callback theme={null}
  {
    "code": 400,
    "msg": "WAV format conversion failed",
    "data": {
      "audioWavUrl": null,
      "task_id": "988e****c8d3"
    }
  }
  ```
</CodeGroup>

## Status Code Description

<ParamField path="code" type="integer" required>
  Callback status code indicating task processing result:

  | Status Code | Description                                                               |
  | ----------- | ------------------------------------------------------------------------- |
  | 200         | Success - WAV format conversion completed                                 |
  | 400         | Bad Request - Parameter error, unsupported source audio file format, etc. |
  | 451         | Download Failed - Unable to download source audio file                    |
  | 500         | Server Error - Please try again later                                     |
</ParamField>

<ParamField path="msg" type="string" required>
  Status message providing detailed status description
</ParamField>

<ParamField path="data.task_id" type="string" required>
  Task ID, consistent with the taskId returned when you submitted the task
</ParamField>

<ParamField path="data.audioWavUrl" type="string">
  Converted WAV audio file download URL, returned on success
</ParamField>

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <Tab title="Node.js">
    ```javascript  theme={null}
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/wav-conversion-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received WAV format conversion callback:', {
        taskId: data.task_id,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('WAV format conversion completed');
        console.log(`WAV file URL: ${data.audioWavUrl}`);
        
        // Download WAV file
        if (data.audioWavUrl) {
          const https = require('https');
          const fs = require('fs');
          
          const filename = `wav_${data.task_id}.wav`;
          const file = fs.createWriteStream(filename);
          
          https.get(data.audioWavUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              console.log(`WAV file saved as ${filename}`);
            });
          }).on('error', (err) => {
            console.error('WAV file download failed:', err.message);
          });
        }
        
      } else {
        // Task failed
        console.log('WAV format conversion failed:', msg);
        
        // Handle failure cases...
        if (code === 400) {
          console.log('Parameter error or unsupported source file format');
        } else if (code === 451) {
          console.log('Source audio file download failed');
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

    @app.route('/wav-conversion-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        audioWavUrl = callback_data.get('audioWavUrl')
        
        print(f"Received WAV format conversion callback: {task_id}, status: {code}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            print("WAV format conversion completed")
            print(f"WAV file URL: {audioWavUrl}")
            
            # Download WAV file example
            if audioWavUrl:
                try:
                    response = requests.get(audioWavUrl)
                    if response.status_code == 200:
                        filename = f"wav_{task_id}.wav"
                        with open(filename, "wb") as f:
                            f.write(response.content)
                        print(f"WAV file saved as {filename}")
                except Exception as e:
                    print(f"WAV file download failed: {e}")
                    
        else:
            # Task failed
            print(f"WAV format conversion failed: {msg}")
            
            # Handle failure cases...
            if code == 400:
                print("Parameter error or unsupported source file format")
            elif code == 451:
                print("Source audio file download failed")
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
    $audioWavUrl = $callbackData['audioWavUrl'] ?? '';

    error_log("Received WAV format conversion callback: $taskId, status: $code, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        error_log("WAV format conversion completed");
        error_log("WAV file URL: $audioWavUrl");
        
        // Download WAV file example
        if ($audioWavUrl) {
            try {
                $wavContent = file_get_contents($audioWavUrl);
                if ($wavContent !== false) {
                    $filename = "wav_{$taskId}.wav";
                    file_put_contents($filename, $wavContent);
                    error_log("WAV file saved as $filename");
                }
            } catch (Exception $e) {
                error_log("WAV file download failed: " . $e->getMessage());
            }
        }
        
    } else {
        // Task failed
        error_log("WAV format conversion failed: $msg");
        
        // Handle failure cases...
        if ($code === 400) {
            error_log("Parameter error or unsupported source file format");
        } elseif ($code === 451) {
            error_log("Source audio file download failed");
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
  6. **File Processing**: WAV file download and processing should be done in asynchronous tasks to avoid blocking callback response
</Tip>

<Warning>
  ### Important Reminders

  * Callback URL must be a publicly accessible address
  * Server must respond within 15 seconds, otherwise it will be considered a timeout
  * If 3 consecutive retries fail, the system will stop sending callbacks
  * Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
  * Generated WAV file URLs may have time limits, recommend downloading and saving promptly
  * WAV files are typically larger than MP3 files, pay attention to storage space and download time
  * Ensure sufficient disk space to save WAV files
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

  <Accordion title="File Processing Issues">
    * Confirm that WAV file URLs are accessible
    * Check file download permissions and network connections
    * Verify file save paths and permissions
    * Note WAV file size, ensure sufficient storage space
    * Confirm source audio file format is supported
  </Accordion>
</AccordionGroup>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card title="Poll Query Results" icon="radar" href="/suno-api/get-wav-conversion-details">
  Use the get WAV conversion details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>


Built with [Mintlify](https://mintlify.com).