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

# Lyrics Generation Callbacks

> When lyrics generation tasks are completed, the system will send results to your provided callback URL via POST request

When you submit a task to the Lyrics Generation API, you can use the `callBackUrl` parameter to set a callback URL. When the task is completed, the system will automatically push the results to your specified address.

## Callback Mechanism Overview

<Info>
  The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
</Info>

### Callback Timing

The system will send callback notifications in the following situations:

* Lyrics generation task completed successfully
* Lyrics generation task failed
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
    "msg": "All generated successfully.",
    "data": {
      "callbackType": "complete",
      "taskId": "11dc****8b0f",
      "data": [
        {
          "text": "[Verse]\nWalking through the city's darkest night\nWith dreams burning like a blazing fire",
          "title": "Iron Man",
          "status": "complete",
          "errorMessage": ""
        },
        {
          "text": "[Verse]\nWind is calling out my name\nSteel armor shining in the light",
          "title": "Iron Man",
          "status": "complete",
          "errorMessage": ""
        }
      ]
    }
  }
  ```

  ```json Failure Callback theme={null}
  {
    "code": 400,
    "msg": "Lyrics generation failed",
    "data": {
      "callbackType": "error",
      "taskId": "11dc****8b0f",
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
  | 200         | Success - Lyrics generation completed                  |
  | 400         | Bad Request - Parameter error, content violation, etc. |
  | 451         | Download Failed - Unable to download related files     |
  | 500         | Server Error - Please try again later                  |
</ParamField>

<ParamField path="msg" type="string" required>
  Status message providing detailed status description
</ParamField>

<ParamField path="data.callbackType" type="string" required>
  Callback type indicating the current callback stage:

  * `complete`: Lyrics generation completed
  * `error`: Task failed
</ParamField>

<ParamField path="data.taskId" type="string" required>
  Task ID, consistent with the taskId returned when you submitted the task
</ParamField>

<ParamField path="data.data" type="array">
  Lyrics generation result information, returns multiple lyrics variants on success
</ParamField>

<ParamField path="data.data[].text" type="string">
  Generated lyrics content, including song structure markers (e.g., \[Verse], \[Chorus], etc.)
</ParamField>

<ParamField path="data.data[].title" type="string">
  Lyrics title
</ParamField>

<ParamField path="data.data[].status" type="string">
  Lyrics generation status:

  * `complete`: Generation completed
  * `failed`: Generation failed
</ParamField>

<ParamField path="data.data[].errorMessage" type="string">
  Error message, contains specific error description when status is failed
</ParamField>

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <Tab title="Node.js">
    ```javascript  theme={null}
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/generate-lyrics-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received lyrics generation callback:', {
        taskId: data.taskId,
        callbackType: data.callbackType,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('Lyrics generation completed');
        const lyricsData = data.data || [];
        
        console.log(`Generated ${lyricsData.length} lyrics variants:`);
        lyricsData.forEach((lyrics, index) => {
          console.log(`Lyrics variant ${index + 1}:`);
          console.log(`  Title: ${lyrics.title}`);
          console.log(`  Status: ${lyrics.status}`);
          if (lyrics.status === 'complete') {
            console.log(`  Lyrics content:\n${lyrics.text}`);
          } else {
            console.log(`  Error message: ${lyrics.errorMessage}`);
          }
        });
        
        // Process generated lyrics
        // Can save to database, files, etc.
        
      } else {
        // Task failed
        console.log('Lyrics generation failed:', msg);
        
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

    app = Flask(__name__)

    @app.route('/generate-lyrics-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('taskId')
        callback_type = callback_data.get('callbackType')
        lyrics_data = callback_data.get('data', [])
        
        print(f"Received lyrics generation callback: {task_id}, type: {callback_type}, status: {code}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            print("Lyrics generation completed")
            
            print(f"Generated {len(lyrics_data)} lyrics variants:")
            for i, lyrics in enumerate(lyrics_data):
                print(f"Lyrics variant {i + 1}:")
                print(f"  Title: {lyrics.get('title')}")
                print(f"  Status: {lyrics.get('status')}")
                if lyrics.get('status') == 'complete':
                    print(f"  Lyrics content:\n{lyrics.get('text')}")
                    
                    # Save lyrics to file example
                    try:
                        filename = f"lyrics_{task_id}_{i + 1}.txt"
                        with open(filename, "w", encoding="utf-8") as f:
                            f.write(f"Title: {lyrics.get('title')}\n\n")
                            f.write(lyrics.get('text'))
                        print(f"Lyrics saved as {filename}")
                    except Exception as e:
                        print(f"Lyrics save failed: {e}")
                else:
                    print(f"  Error message: {lyrics.get('errorMessage')}")
                    
        else:
            # Task failed
            print(f"Lyrics generation failed: {msg}")
            
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
    $taskId = $callbackData['taskId'] ?? '';
    $callbackType = $callbackData['callbackType'] ?? '';
    $lyricsData = $callbackData['data'] ?? [];

    error_log("Received lyrics generation callback: $taskId, type: $callbackType, status: $code, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        error_log("Lyrics generation completed");
        
        error_log("Generated " . count($lyricsData) . " lyrics variants:");
        foreach ($lyricsData as $index => $lyrics) {
            error_log("Lyrics variant " . ($index + 1) . ":");
            error_log("  Title: " . ($lyrics['title'] ?? ''));
            error_log("  Status: " . ($lyrics['status'] ?? ''));
            
            if (($lyrics['status'] ?? '') === 'complete') {
                error_log("  Lyrics content:\n" . ($lyrics['text'] ?? ''));
                
                // Save lyrics to file example
                try {
                    $filename = "lyrics_{$taskId}_" . ($index + 1) . ".txt";
                    $content = "Title: " . ($lyrics['title'] ?? '') . "\n\n" . ($lyrics['text'] ?? '');
                    file_put_contents($filename, $content);
                    error_log("Lyrics saved as $filename");
                } catch (Exception $e) {
                    error_log("Lyrics save failed: " . $e->getMessage());
                }
            } else {
                error_log("  Error message: " . ($lyrics['errorMessage'] ?? ''));
            }
        }
        
    } else {
        // Task failed
        error_log("Lyrics generation failed: $msg");
        
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
  6. **Lyrics Storage**: Lyrics content should be saved to database or file system promptly
</Tip>

<Warning>
  ### Important Reminders

  * Callback URL must be a publicly accessible address
  * Server must respond within 15 seconds, otherwise it will be considered a timeout
  * If 3 consecutive retries fail, the system will stop sending callbacks
  * Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
  * Pay attention to content policy compliance to avoid generation failures due to policy violations
  * Lyrics content may contain special characters, pay attention to encoding handling
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

  <Accordion title="Lyrics Processing Issues">
    * Note that lyrics content may contain line breaks and special characters
    * Ensure text encoding is handled correctly (recommend using UTF-8)
    * Verify lyrics save paths and permissions
    * Note whether lyrics content complies with content policies
  </Accordion>
</AccordionGroup>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card title="Poll Query Results" icon="radar" href="/suno-api/get-lyrics-generation-details">
  Use the get lyrics generation details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>


Built with [Mintlify](https://mintlify.com).