import React, { useState, useEffect, useCallback } from "react";
import Linkweb from "@mui/material/Link";
import Papa from "papaparse";
import "./App.css";
import { DataGrid, GridColDef } from "@mui/x-data-grid";

const GitHubURL = "https://";

const csvURL =
  "https://raw.githubusercontent.com/emanuelef/cncf-repos-stats/main/dep-repo-latest.csv";

const columns: GridColDef[] = [
  {
    field: "dep",
    headerName: "Module",
    width: 200,
    renderCell: (params) => (
      <Linkweb href={GitHubURL + params.value} target="_blank">
        {params.value}
      </Linkweb>
    ),
  },
  {
    field: "go_cncf_repos_using_dep",
    headerName: "Repos",
    width: 90,
    valueGetter: (params) => parseInt(params.value),
  },
];

function DepsChart() {
  const [dataRows, setDataRows] = useState([]);

  const loadData = async () => {
    fetch(csvURL)
      .then((response) => response.text())
      .then((text) => Papa.parse(text, { header: true, skipEmptyLines: true }))
      .then(function (result) {
        console.log(result);
        setDataRows(result.data);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div>
      {" "}
      <DataGrid
        getRowId={(row) => row.dep}
        rows={dataRows}
        columns={columns}
        rowHeight={30}
        initialState={{
          pagination: {
            paginationModel: { page: 0, pageSize: 50 },
          },
          sorting: {
            sortModel: [{ field: "go_cncf_repos_using_dep", sort: "desc" }],
          },
        }}
        pageSizeOptions={[5, 10, 50]}
      />
    </div>
  );
}

export default DepsChart;
