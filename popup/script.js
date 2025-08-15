function listenForClicks() {
    function generate(tabs) {
        console.log("Sending generate message to content script");
        browser.tabs.sendMessage(tabs[0].id, {
            command: "generate"
        }).then((response) => {
            console.log("Message sent successfully", response);
        }).catch((error) => {
            console.error("Error sending message:", error);
            reportError("Failed to communicate with page content");
        });
    }

    function handleError(error) {
        console.error("Query tabs error:", error);
        reportError("Could not access current tab");
    }

    function reportError(message) {
        document.querySelector("#popup-content").classList.add("hidden");
        document.querySelector("#error-content").classList.remove("hidden");
        document.querySelector("#error-content p").textContent = message;
    }

    document.addEventListener("click", (e) => {
        console.log("Button clicked:", e.target);
        
        if (e.target.id === "generate-btn") {
            e.preventDefault();
            console.log("Generate button clicked");
            
            browser.tabs
                .query({ active: true, currentWindow: true })
                .then(generate)
                .catch(handleError);
        }
    });
}

/**
 * There was an error executing the script.
 * Display the popup's error message, and hide the normal UI .
 */
function reportExecuteScriptError(error) {
    document.querySelector("#popup-content").classList.add("hidden");
    document.querySelector("#error-content").classList.remove("hidden");
    console.error(`Failed to execute x-gif-dl content script: ${error.message}`);
}

// Initialize the extension
console.log("Initializing x-gif-dl popup");

browser.tabs
    .executeScript({ file: "/content_scripts/generate.js" })
    .then(() => {
        console.log("Content script injected successfully");
        listenForClicks();
    })
    .catch(reportExecuteScriptError);