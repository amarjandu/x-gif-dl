(() => {
    /**
     * Check and set a global guard variable.
     * If this content script is injected into the same page again,
     * it will do nothing next time.
     */
    if (window.hasRun) {
        return;
    }
    window.hasRun = true;

    console.log("x-gif-dl content script loaded");

    /**
     * Listen for messages from the popup script.
     */
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Received message:", message);
        
        if (message.command === "generate") {
            try {
                
                const videos = document.querySelectorAll('video');
                console.log("Found videos:", videos.length);
                
                if (videos.length === 0) {
                    console.error("No video elements found on page");
                    sendResponse({ success: false, error: "No videos found on this page" });
                    return;
                }

                // Get the first video's source
                const video = videos[0];
                console.log("Video element:", video);
                console.log("Video src:", video.src);
                console.log("Video currentSrc:", video.currentSrc);
                
                // Try to get the video URL from various sources
                let videoUrl = video.src || video.currentSrc;
                
                // If no direct src, try to find it in source elements
                if (!videoUrl) {
                    const sources = video.querySelectorAll('source');
                    if (sources.length > 0) {
                        videoUrl = sources[0].src;
                    }
                }
                
                if (!videoUrl) {
                    console.error("No video URL found");
                    sendResponse({ success: false, error: "Could not find video URL" });
                    return;
                }
                
                console.log("Opening video URL:", videoUrl);
                
                // Open the video URL in a new tab
                window.open(videoUrl, '_blank');
                
                sendResponse({ success: true, videoUrl: videoUrl });
                
            } catch (error) {
                console.error("Error in generate command:", error);
                sendResponse({ success: false, error: error.message });
            }
        }
        
        // Return true to indicate we will send a response asynchronously
        return true;
    });
})();