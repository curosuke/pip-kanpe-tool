if (!globalThis.__pipKanpeHotkeysInstalled) {
  globalThis.__pipKanpeHotkeysInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "pip-kanpe-tool" || message.type !== "command") {
      return false;
    }

    sendResponse(runCommand(message.command));
    return false;
  });
}

function runCommand(command) {
  const buttonId = {
    previous: "preview-pip-prev",
    next: "preview-pip-next",
  }[command];

  const button = buttonId ? document.getElementById(buttonId) : null;
  if (button instanceof HTMLButtonElement) {
    if (button.disabled) {
      return { ok: false, reason: "button-disabled" };
    }

    button.click();
    return { ok: true, via: "button-click" };
  }

  window.postMessage(
    {
      source: "pip-kanpe-hotkeys",
      type: "command",
      command,
    },
    window.location.origin,
  );
  return { ok: true, via: "window-message" };
}
