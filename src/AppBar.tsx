import React, { useState } from 'react';

import Icon from './assets/icons/Icon-Electron.png';

function AppBar() {
  const [isMaximize, setMaximize] = useState(false);

  const handleToggle = () => {
    if (isMaximize) {
      setMaximize(false);
    } else {
      setMaximize(true);
    }
    window.Main.Maximize();
  };

  return (
    <>
      <div className="draggable flex justify-between bg-[var(--matte-panel)] py-0.5 text-[var(--matte-text)]">
        <div className="inline-flex">
          <img className="h-6 lg:-ml-2" src={Icon} alt="Icon of Electron" />
          <p className="text-xs md:pt-1 md:-ml-1 lg:-ml-2">myGPT</p>
        </div>
        <div className="inline-flex -mt-1">
          <button onClick={window.Main.Minimize} className="undraggable pt-1 hover:bg-[rgba(232,226,214,0.08)] md:px-4 lg:px-3">
            &#8211;
          </button>
          <button onClick={handleToggle} className="undraggable px-6 pt-1 hover:bg-[rgba(232,226,214,0.08)] lg:px-5">
            {isMaximize ? '\u2752' : '⃞'}
          </button>
          <button onClick={window.Main.Close} className="undraggable px-4 pt-1 hover:bg-[var(--matte-danger-soft)] hover:text-[#f0bbb2]">
            &#10005;
          </button>
        </div>
      </div>
      <div className="undraggable bg-[var(--matte-panel)] text-[var(--matte-text)]">
        <div className="flex text-center">
          <div className="w-8 text-sm hover:bg-[rgba(232,226,214,0.08)]">File</div>
          <div className="w-8 text-sm hover:bg-[rgba(232,226,214,0.08)]">Edit</div>
          <div className="w-10 text-sm hover:bg-[rgba(232,226,214,0.08)]">View</div>
          <div className="w-14 text-sm hover:bg-[rgba(232,226,214,0.08)]">Window</div>
          <div className="w-9 text-sm hover:bg-[rgba(232,226,214,0.08)]">Help</div>
        </div>
      </div>
    </>
  );
}

export default AppBar;
