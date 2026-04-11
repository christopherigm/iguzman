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

# MIDI Generation Callbacks

> System will call this callback when MIDI generation from separated audio is complete.

When you submit a MIDI generation task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

<Info>
  The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
</Info>

### Callback Timing

The system will send callback notifications in the following situations:

* MIDI generation task completed successfully
* MIDI generation task failed
* Errors occurred during task processing

### Callback Method

* **HTTP Method**: POST
* **Content Type**: application/json
* **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl`:

<CodeGroup>
  ```json Success Callback theme={null}
  {
    "task_id": "5c79****be8e",
    "code": 200,
    "msg": "success",
    "data": {
      "state": "complete",
      "instruments": [
        {
          "name": "Drums",
          "notes": [
            {
              "pitch": 73,
              "start": "0.036458333333333336",
              "end": "0.18229166666666666",
              "velocity": 1
            },
            {
              "pitch": 61,
              "start": 0.046875,
              "end": "0.19270833333333334",
              "velocity": 1
            },
            {
              "pitch": 73,
              "start": 0.1875,
              "end": "0.4895833333333333",
              "velocity": 1
            }
          ]
        },
        {
          "name": "Electric Bass (finger)",
          "notes": [
            {
              "pitch": 44,
              "start": 7.6875,
              "end": "7.911458333333333",
              "velocity": 1
            },
            {
              "pitch": 56,
              "start": 7.6875,
              "end": "7.911458333333333",
              "velocity": 1
            },
            {
              "pitch": 51,
              "start": 7.6875,
              "end": "7.911458333333333",
              "velocity": 1
            }
          ]
        }
      ]
    }
  }
  ```

  ```json Failure Callback theme={null}
  {
    "task_id": "5c79****be8e",
    "code": 500,
    "msg": "MIDI generation failed",
    "data": null
  }
  ```
</CodeGroup>

## Status Code Description

<ParamField path="code" type="integer" required>
  Callback status code indicating task processing result:

  | Status Code | Description                                          |
  | ----------- | ---------------------------------------------------- |
  | 200         | Success - MIDI generation completed successfully     |
  | 500         | Internal Error - Please try again or contact support |
</ParamField>

<ParamField path="msg" type="string" required>
  Status message providing detailed status description
</ParamField>

<ParamField path="task_id" type="string" required>
  Task ID, consistent with the task\_id returned when you submitted the task
</ParamField>

<ParamField path="data" type="object">
  MIDI generation result information, returned on success
</ParamField>

## Success Response Fields

<ParamField path="data.state" type="string">
  Processing state. Value: `complete` when successful
</ParamField>

<ParamField path="data.instruments" type="array">
  Array of detected instruments with their MIDI note data

  <Expandable title="Instrument Object Properties">
    <ParamField path="name" type="string">
      Instrument name (e.g., "Drums", "Electric Bass (finger)", "Acoustic Grand Piano")
    </ParamField>

    <ParamField path="notes" type="array">
      Array of MIDI notes for this instrument

      <Expandable title="Note Object Properties">
        <ParamField path="pitch" type="integer">
          MIDI note number (0-127). Middle C = 60. [MIDI note reference](https://inspiredacoustics.com/en/MIDI_note_numbers_and_center_frequencies)
        </ParamField>

        <ParamField path="start" type="number | string">
          Note start time in seconds from beginning of audio
        </ParamField>

        <ParamField path="end" type="number | string">
          Note end time in seconds from beginning of audio
        </ParamField>

        <ParamField path="velocity" type="number">
          Note velocity/intensity (0-1 range). 1 = maximum velocity
        </ParamField>
      </Expandable>
    </ParamField>
  </Expandable>
</ParamField>

## Callback Reception Examples

Below are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <Tab title="Node.js">
    ```javascript  theme={null}
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-midi-callback', (req, res) => {
      const { code, msg, task_id, data } = req.body;
      
      console.log('Received MIDI generation callback:', {
        taskId: task_id,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('MIDI generation completed');
        
        if (data && data.instruments) {
          console.log(`Detected ${data.instruments.length} instruments`);
          
          data.instruments.forEach(instrument => {
            console.log(`\nInstrument: ${instrument.name}`);
            console.log(`  Note count: ${instrument.notes.length}`);
            
            // Process each note
            instrument.notes.forEach((note, idx) => {
              if (idx < 3) { // Show first 3 notes as example
                console.log(`  Note ${idx + 1}: Pitch ${note.pitch}, ` +
                           `Start ${note.start}s, End ${note.end}s, ` +
                           `Velocity ${note.velocity}`);
              }
            });
          });
          
          // Save MIDI data to database or file
          // processMidiData(task_id, data);
        }
        
      } else {
        // Task failed
        console.log('MIDI generation failed:', msg);
        
        // Handle failure scenarios...
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
    import json

    app = Flask(__name__)

    @app.route('/suno-midi-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        task_id = data.get('task_id')
        callback_data = data.get('data', {})
        
        print(f"Received MIDI generation callback: {task_id}, status: {code}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            print("MIDI generation completed")
            
            if callback_data and 'instruments' in callback_data:
                instruments = callback_data['instruments']
                print(f"Detected {len(instruments)} instruments")
                
                for instrument in instruments:
                    name = instrument.get('name')
                    notes = instrument.get('notes', [])
                    print(f"\nInstrument: {name}")
                    print(f"  Note count: {len(notes)}")
                    
                    # Process each note
                    for idx, note in enumerate(notes[:3]):  # Show first 3 notes
                        print(f"  Note {idx + 1}: Pitch {note['pitch']}, "
                              f"Start {note['start']}s, End {note['end']}s, "
                              f"Velocity {note['velocity']}")
                
                # Save MIDI data to file
                with open(f"midi_{task_id}.json", "w") as f:
                    json.dump(callback_data, f, indent=2)
                print(f"MIDI data saved to midi_{task_id}.json")
                
        else:
            # Task failed
            print(f"MIDI generation failed: {msg}")
            
            # Handle failure scenarios...
        
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
    $taskId = $data['task_id'] ?? '';
    $callbackData = $data['data'] ?? null;

    error_log("Received MIDI generation callback: $taskId, status: $code, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        error_log("MIDI generation completed");
        
        if ($callbackData && isset($callbackData['instruments'])) {
            $instruments = $callbackData['instruments'];
            error_log("Detected " . count($instruments) . " instruments");
            
            foreach ($instruments as $instrument) {
                $name = $instrument['name'] ?? '';
                $notes = $instrument['notes'] ?? [];
                error_log("Instrument: $name");
                error_log("  Note count: " . count($notes));
                
                // Process first 3 notes as example
                foreach (array_slice($notes, 0, 3) as $idx => $note) {
                    error_log(sprintf(
                        "  Note %d: Pitch %d, Start %ss, End %ss, Velocity %s",
                        $idx + 1,
                        $note['pitch'],
                        $note['start'],
                        $note['end'],
                        $note['velocity']
                    ));
                }
            }
            
            // Save MIDI data to file
            $filename = "midi_$taskId.json";
            file_put_contents($filename, json_encode($callbackData, JSON_PRETTY_PRINT));
            error_log("MIDI data saved to $filename");
        }
        
    } else {
        // Task failed
        error_log("MIDI generation failed: $msg");
        
        // Handle failure scenarios...
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

  1. **Use HTTPS**: Ensure callback URL uses HTTPS protocol for secure data transmission
  2. **Verify Origin**: Verify the legitimacy of the request source in callback processing
  3. **Idempotent Processing**: The same task\_id may receive multiple callbacks, ensure processing logic is idempotent
  4. **Quick Response**: Callback processing should return 200 status code quickly to avoid timeout
  5. **Asynchronous Processing**: Complex business logic (like MIDI file conversion) should be processed asynchronously
  6. **Handle Missing Instruments**: Not all instruments may be detected - handle empty or missing instrument arrays gracefully
  7. **Store Raw Data**: Save the complete JSON response for future reference and reprocessing
</Tip>

<Warning>
  ### Important Reminders

  * Callback URL must be publicly accessible
  * Server must respond within 15 seconds, otherwise will be considered timeout
  * If 3 consecutive retry attempts fail, the system will stop sending callbacks
  * Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
  * MIDI data is retained for 14 days - download and save promptly if needed long-term
  * The number and types of instruments detected depends on audio content
  * Note times (start/end) may be strings or numbers - handle both types
</Warning>

## Troubleshooting

If you are not receiving callback notifications, please check the following:

<AccordionGroup>
  <Accordion title="Network Connection Issues">
    * Confirm callback URL is accessible from public internet
    * Check firewall settings to ensure inbound requests are not blocked
    * Verify domain name resolution is correct
  </Accordion>

  <Accordion title="Server Response Issues">
    * Ensure server returns HTTP 200 status code within 15 seconds
    * Check server logs for error messages
    * Verify endpoint path and HTTP method are correct
  </Accordion>

  <Accordion title="Content Format Issues">
    * Confirm received POST request body is in JSON format
    * Check if Content-Type is application/json
    * Verify JSON parsing is correct
    * Handle both string and number types for timing values
  </Accordion>

  <Accordion title="Data Processing Issues">
    * Some instruments may have empty note arrays
    * Not all audio will detect all instrument types
    * Verify the original vocal separation used `split_stem` type (not `separate_vocal`)
    * Check that the source taskId is from a successfully completed separation
  </Accordion>
</AccordionGroup>

## Alternative Solutions

If you cannot use the callback mechanism, you can also use polling:

<Card title="Poll Query Results" icon="radar" href="/suno-api/get-midi-details">
  Use the Get MIDI Generation Details endpoint to periodically query task status. We recommend querying every 10-30 seconds.
</Card>


Built with [Mintlify](https://mintlify.com).