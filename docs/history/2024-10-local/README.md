# October 2024, the version that lived only on disk

These two files were in `D:\_GitHub\listolista` when the October 2026 rebuild started and had never been committed. They are one step after commit `aad7542` ("Checkboxes", 2024-10-05): each line's checkbox state is saved (`inputs` = `[{value, done}]`) and a ticked line is struck through. `index2.html` differs only by a renamed function (`forceFocusOnNextEmptyInput`).

They are kept as history, not served. The new app imports the `inputs` key they wrote (`src/model/legacy.js`).
