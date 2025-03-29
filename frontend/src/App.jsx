import { Canvas } from "@react-three/fiber";
import { Experience } from "./components/Experience";
import { useState, useRef } from "react";
import audioBufferToWav from 'audiobuffer-to-wav'; // Import the library

function App() {
  const [isRecording, setIsRecording] = useState(false);
  // ****** ADJUST STATE BASED ON BACKEND RESPONSE ******
  // The backend now sends transcript and visemes, not an audio URL.
  // You might need state for these instead:
  const [transcript, setTranscript] = useState(null);
  const [visemeData, setVisemeData] = useState(null);
  // Remove or repurpose serverAudio state if no longer needed
  // const [serverAudio, setServerAudio] = useState(null);
  // *******************************************************

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const audioContextRef = useRef(null); // Ref for AudioContext

  // Helper to get AudioContext
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const startRecording = async () => {
    try {
      setError(null);
      setTranscript(null); // Clear previous results
      setVisemeData(null); // Clear previous results
      setIsRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Use options to potentially influence codec, though browser support varies
      const options = { mimeType: 'audio/webm' }; // Stick to webm for recording
      mediaRecorder.current = new MediaRecorder(stream, options);

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.current.push(e.data);
        }
      };

      // Modified onstop handler for WAV conversion
      mediaRecorder.current.onstop = async () => {
        setIsProcessing(true); // Start processing indicator earlier
        setError(null); // Clear errors before processing

        const audioBlobWebm = new Blob(audioChunks.current, { type: 'audio/webm' });
        audioChunks.current = []; // Clear chunks immediately

        if (audioBlobWebm.size === 0) {
             console.warn("Recorded Blob size is 0. Cannot process.");
             setError("Recording failed (empty audio). Please try again.");
             setIsProcessing(false);
             setIsRecording(false); // Ensure recording state is reset
             return;
        }

        try {
          const arrayBuffer = await audioBlobWebm.arrayBuffer();
          const audioContext = getAudioContext();

          // Decode the WebM data into an AudioBuffer
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          // Encode the AudioBuffer to a WAV Blob
          // audioBufferToWav returns an ArrayBuffer, wrap it in a Blob
          const wavArrayBuffer = audioBufferToWav(audioBuffer);
          const wavBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' });

          console.log("WAV Blob created, size:", wavBlob.size);

          // Send the WAV Blob to the server
          await sendToServer(wavBlob, 'recording.wav');

        } catch (conversionError) {
          console.error("Error converting audio to WAV:", conversionError);
          setError(`Failed to convert audio to WAV: ${conversionError.message}`);
          setIsProcessing(false); // Reset processing state on error
          setIsRecording(false); // Ensure recording state is reset
        }
        // Note: setIsProcessing(false) is now handled within sendToServer or the catch block
      };

      mediaRecorder.current.start();

    } catch (err) {
      console.error("Error starting recording:", err);
      // More specific error checking
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
           setError('Microphone access denied. Please allow microphone permissions.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
           setError('No microphone found. Please ensure a microphone is connected.');
      } else {
           setError('Could not start recording. Please check microphone connection and permissions.');
      }
      setIsRecording(false); // Ensure state is reset if start fails
      setIsProcessing(false); // Ensure processing state is reset
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop(); // This triggers the onstop handler
      // Stop the stream tracks AFTER the recorder has stopped and processed data
      // Doing it here might cut off the last chunk in some browsers
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      // Let the onstop handler manage setIsProcessing
    }
  };

  // Modified sendToServer to accept filename and handle new backend response
  const sendToServer = async (audioBlob, filename) => {
    // Processing state is already true if called from onstop
    // setError should be cleared before calling this

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, filename); // Use the passed filename

      console.log(`Sending ${filename} to server...`);

      const response = await fetch('http://127.0.0.1:5000/api/process-speech', {
        method: 'POST',
        body: formData,
        // Keep-alive might not be needed/useful for single file uploads
        // headers: { 'Connection': 'keep-alive' }
      });

      // More detailed error handling
      if (!response.ok) {
        let errorPayload = { message: `Server error: ${response.status} ${response.statusText}` };
        try {
           const errorJson = await response.json();
           errorPayload = { ...errorPayload, ...errorJson }; // Merge server error details
           console.error("Server returned error:", errorJson);
        } catch (e) {
           // Response wasn't JSON, stick with the status text
           console.error("Server returned non-JSON error:", await response.text());
        }
        // Construct a user-friendly message if possible
        const displayError = errorPayload.details || errorPayload.error || errorPayload.message;
        throw new Error(displayError);
      }

      const result = await response.json();
      console.log("Server Response:", result);

      // ****** UPDATE STATE BASED ON ACTUAL BACKEND RESPONSE ******
      setTranscript(result.transcript);
      setVisemeData(result.viseme_data);
      // setServerAudio(null); // Clear or repurpose old state
      // ***********************************************************

    } catch (err) {
      console.error("Error sending/processing audio:", err);
      setError(err.message || "An unknown error occurred during upload/processing.");
      setTranscript(null); // Clear results on error
      setVisemeData(null); // Clear results on error
    } finally {
      // This ensures processing stops even if server communication fails
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Canvas shadows camera={{ position: [0, 0, 8], fov: 42 }}>
        <color attach="background" args={["#ececec"]} />
        {/* ****** PASS NEW PROPS TO EXPERIENCE ****** */}
        <Experience transcript={transcript} visemeData={visemeData} />
        {/* ****************************************** */}
      </Canvas>

      {/* Recording UI */}
      <div style={styles.controls}>
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording} // Handle touch devices
          onTouchEnd={stopRecording}   // Handle touch devices
          style={{
            ...styles.button,
            backgroundColor: isRecording ? '#ff6b6b' : '#51cf66', // Updated colors
            color: 'white',
            cursor: isProcessing ? 'not-allowed' : 'pointer', // Indicate disabled state
            opacity: isProcessing ? 0.6 : 1
          }}
          disabled={isProcessing} // Disable button while processing
        >
          {isProcessing ? 'Processing...' : (isRecording ? 'Recording... Release to Stop' : 'Hold to Speak')}
        </button>

        {error && <div style={styles.error}>{error}</div>}
      </div>
    </>
  );
}

// Styles (minor adjustments for clarity)
const styles = {
  controls: {
    position: 'fixed',
    bottom: '30px', // Slightly higher
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px' // More spacing
  },
  button: {
    padding: '15px 35px', // Slightly wider
    fontSize: '1.1rem', // Adjusted size
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '30px', // More rounded
    cursor: 'pointer',
    transition: 'all 0.2s ease-in-out', // Faster transition
    boxShadow: '0 5px 15px rgba(0, 0, 0, 0.15)' // Slightly more shadow
  },
  error: {
    color: '#fa5252', // Brighter red
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // Lighter background
    padding: '10px 18px', // More padding
    borderRadius: '10px', // More rounded
    textAlign: 'center',
    maxWidth: '80%',
    fontSize: '0.9rem',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
  }
};


export default App;