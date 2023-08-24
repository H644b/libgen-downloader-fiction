import React, { useCallback, useEffect } from "react";
import { useFocus } from "ink";

import Input from "../../../components/Input";
import { useAppActionContext } from "../../../contexts/AppActionContext";
import { useLayoutContext } from "../../../contexts/LayoutContext";
import { SEARCH_MIN_CHAR } from "../../../../constants";
import { LAYOUT_KEY } from "../../keys";
import { useAppStateContext } from "../../../contexts/AppStateContext";

const SearchInput: React.FC = () => {
  const { searchValue, setSearchValue, showSearchMinCharWarning, setShowSearchMinCharWarning } =
    useAppStateContext();

  const { handleSearch } = useAppActionContext();

  const { setActiveLayout } = useLayoutContext();

  const { isFocused } = useFocus({ autoFocus: true });

  const handleSubmit = useCallback(async () => {
    if (searchValue.length < SEARCH_MIN_CHAR) {
      setShowSearchMinCharWarning(true);
      return;
    }

    await handleSearch();
    setActiveLayout(LAYOUT_KEY.RESULT_LIST_LAYOUT);
  }, [searchValue, setShowSearchMinCharWarning, handleSearch, setActiveLayout]);

  useEffect(() => {
    if (showSearchMinCharWarning && searchValue.length >= SEARCH_MIN_CHAR) {
      setShowSearchMinCharWarning(false);
    }
  }, [searchValue, showSearchMinCharWarning, setShowSearchMinCharWarning]);
  return (
    <Input
      label="Search"
      placeholder={`Search string must contain minimum ${SEARCH_MIN_CHAR} characters.`}
      isFocused={isFocused}
      searchValue={searchValue}
      onSearchValueChange={setSearchValue}
      onSubmit={handleSubmit}
    />
  );
};

export default SearchInput;
