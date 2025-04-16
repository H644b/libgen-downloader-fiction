import React from "react";
import { Box, Text, useFocusManager, Newline } from "ink"; // Added useFocusManager, Newline
import { useBoundStore } from "../../../store/index";
import { SearchByItem } from "./SearchByItem";

export function SearchBy() {
  const columnFilterQueryParamValues = useBoundStore((state) => state.columnFilterQueryParamValues);
  const selectedSearchByOption = useBoundStore((state) => state.selectedSearchByOption);
  const setSelectedSearchByOption = useBoundStore((state) => state.setSelectedSearchByOption);
  const searchSection = useBoundStore((state) => state.searchSection); // Get current section
  const { isFocused } = useFocusManager(); // Use focus manager to check if this section is active

  // Only show these options if searching Sci-Tech
  if (searchSection !== 'scitech') {
    return (
        <Box marginTop={1}>
            {/* Provide a more helpful message */}
            <Text color="gray">(Column filters only apply to Sci-Tech searches. Use --scitech flag to enable.)</Text>
        </Box>
    );
  }

  // Ensure columnFilterQueryParamValues is populated before rendering
  if (Object.keys(columnFilterQueryParamValues).length === 0) {
      return (
           <Box marginTop={1}>
                <Text color="yellow">Loading Sci-Tech filter options...</Text>
           </Box>
      );
  }

  // Determine the label for the currently selected Sci-Tech option
  const selectedSearchByOptionLabel = selectedSearchByOption
    ? Object.entries(columnFilterQueryParamValues).find(
        ([, value]) => value === selectedSearchByOption
      )?.[0] ?? "Unknown" // Find the key matching the value
    : "Default"; // Default label for Sci-Tech

  return (
    // Use FocusContext to manage focus within this section
    // This requires ink v3.2.0+ for useFocusManager
    // If using older Ink, alternative focus handling (e.g., props drilling) is needed.
    <Box flexDirection="column" marginTop={1}>
      <Box height={1} marginBottom={1}>
        <Text bold>Search Sci-Tech by: </Text>
        <Text bold color="green">
          {selectedSearchByOptionLabel}
        </Text>
        {/* Add hint only when this whole section is focused */}
         {isFocused && (
            <Text color="gray"> (Use [UP]/[DOWN] arrows, [ENTER] to select)</Text>
         )}
      </Box>
      {/* Make the container Box focusable if needed, or rely on individual items */}
       <Box flexDirection="column" >
         {/* Default option for Sci-Tech */}
         <SearchByItem
           key={"scitech-default"}
           isSelected={selectedSearchByOption === null} // Default is null
           label={"Default"}
           onSelect={() => {
             setSelectedSearchByOption(null);
           }}
         />
         <Newline /> {/* Add space between items */}

         {Object.entries(columnFilterQueryParamValues).map(([key, value]) => {
           return (
             <React.Fragment key={key}>
                 <SearchByItem
                 isSelected={selectedSearchByOption === value}
                 label={key} // Display the human-readable key
                 onSelect={() => {
                     setSelectedSearchByOption(value); // Set the actual value on select
                 }}
                 />
                 <Newline /> {/* Add space between items */}
             </React.Fragment>
           );
         })}
       </Box>
    </Box>
  );
}
