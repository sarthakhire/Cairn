Pairs graded by matchQuote (current PARTIAL_MIN = 0.85). Synthetic pairs built from the demo notes.

| id | class | case | result | method | score | reason |
|---|---|---|---|---|---|---|
| B1 | benign | one typo in a 16-word quote | partial | fuzzy | 0.938 | wording differs from the source (similarity 0.94) |
| B2 | benign | one extra word | partial | fuzzy | 0.941 | wording differs from the source (similarity 0.94) |
| B3 | benign | one word dropped | partial | fuzzy | 0.938 | wording differs from the source (similarity 0.94) |
| B4 | benign | punctuation removed | partial | fuzzy | 1.000 | wording differs from the source (similarity 1.00) |
| B5 | benign | two words swapped (React, Vite) | partial | fuzzy | 0.875 | wording differs from the source (similarity 0.88) |
| B6 | benign | typo in a 7-word quote | partial | fuzzy | 0.857 | wording differs from the source (similarity 0.86) |
| B7 | benign | typo in a 5-word quote | mismatch | fuzzy | 0.800 | closest passage is too different (similarity 0.80) |
| C1 | changed | technology swapped (Angular), no number or negation | partial | fuzzy | 0.938 | wording differs from the source (similarity 0.94) |
| C2 | changed | owner swapped (Karan), 7-word quote | partial | fuzzy | 0.857 | wording differs from the source (similarity 0.86) |
| C3 | changed | owner swapped (Karan), 12-word quote | partial | fuzzy | 0.929 | wording differs from the source (similarity 0.93) |
| C4 | changed | name misspelled into another name, 5 words | mismatch | fuzzy | 0.800 | closest passage is too different (similarity 0.80) |
| C5 | changed | number the source does not contain | mismatch | fuzzy | 0.900 | number differs |
| C6 | changed | negation inserted | mismatch | fuzzy | 0.941 | negation differs |
| N1 | notquote | paraphrase of a real sentence | mismatch | none | 0.375 | no close passage in the cited source |
| N2 | notquote | invented sentence about hosting | mismatch | none | 0.083 | no close passage in the cited source |
| N3 | notquote | real quote cited against the wrong chunk | mismatch | none | 0.231 | no close passage in the cited source |
| N4 | notquote | different task described for the same people | mismatch | none | 0.444 | no close passage in the cited source |

How each threshold would sort the pairs (guards apply at every threshold):

| PARTIAL_MIN | benign accepted | changed fact accepted | not-a-quote accepted |
|---|---|---|---|
| 0.70 | 7 of 7 | 4 of 6 | 0 of 4 |
| 0.75 | 7 of 7 | 4 of 6 | 0 of 4 |
| 0.80 | 7 of 7 | 4 of 6 | 0 of 4 |
| 0.85 | 6 of 7 | 3 of 6 | 0 of 4 |
| 0.90 | 4 of 7 | 2 of 6 | 0 of 4 |
| 0.95 | 1 of 7 | 0 of 6 | 0 of 4 |
