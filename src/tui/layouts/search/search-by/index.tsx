import React from "react";
import { Box, Text, Newline } from "ink"; // Removed useFocusManager
import { useBoundStore } from "../../../store/index";
import { SearchByItem } from "./SearchByItem";

export function SearchBy() {
  const columnFilterQueryParamValues = useBoundStore((state) => state.columnFilterQueryParamValues);
  const selectedSearchByOption = useBoundStore((state) => state.selectedSearchByOption);
  const setSelectedSearchByOption = useBoundStore((state) => state.setSelectedSearchByOption);
  const searchSection = useBoundStore((state) => state.searchSection); // Get current section

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
  // Provide a loading or placeholder state if config hasn't loaded yet
  if (!columnFilterQueryParamValues || Object.keys(columnFilterQueryParamValues).length === 0) {
      return (
           <Box marginTop={1}>
                <Text color="gray"> (Sci-Tech filter options loading or unavailable...)</Text>
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
    // The parent Search layout component will manage focus between SearchInput and this Box
    <Box flexDirection="column" marginTop={1}>
      <Box height={1} marginBottom={1}>
        <Text bold>Search Sci-Tech by: </Text>
        <Text bold color="green">
          {selectedSearchByOptionLabel}
        </Text>
        {/* Hint can be added based on parent focus state if needed */}
      </Box>
      {/* Individual items will handle their focus via useFocus() */}
       <Box flexDirection="column" >
         <SearchByItem
           key={"scitech-default"}
           isSelected={selectedSearchByOption === null} // Default is null
           label={"Default"}
           onSelect={() => {
             setSelectedSearchByOption(null);
           }}
         />
         <Newline />

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
                 <Newline />
             </React.Fragment>
           );
         })}
       </Box>
    </Box>
  );
}
