import "@testing-library/jest-dom";

// jsdom doesn't implement scrollIntoView; App.tsx calls it to auto-scroll the chat.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
