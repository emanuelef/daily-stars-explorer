import { useState, useEffect } from "react";
// @ts-ignore
import Papa from "papaparse";
import "./App.css";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import Linkweb from "@mui/material/Link";
import { ResponsiveTreeMap } from "@nivo/treemap";

import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";

import TimeSeriesChart from "./TimeSeriesChart";
import K8sTimeSeriesChart from "./K8sTimeSeriesChart";
import DepsChart from "./DepsChart";
import LangBarChart from "./LangBarChart";
import LangHCBarChart from "./LangHCBarChart";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link, useParams } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TableViewRounded from "@mui/icons-material/TableViewRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import ViewQuiltRounded from "@mui/icons-material/ViewQuiltRounded";
import { Share } from "@mui/icons-material";

/*
archived
"false"
days-last-commit
"151"
days-last-star
"5"
days-since-creation
"3961"
dependencies
"5"
language
"Go"
mentionable-users
"8"
new-stars-last-7d
"1"
new-stars-last-14d
"5"
new-stars-last-24H
"0"
new-stars-last-30d
"7"
repo
"mewkiz/flac"
stars
"262"
stars-per-mille-30d
"26.718"*/

const GitHubURL = "https://github.com/";

const csvURL =
  "https://raw.githubusercontent.com/emanuelef/cncf-repos-stats/main/analysis-latest.csv";

const ShareableLink = ({ repo }) => {
  return <Link to={`/starstimeline/${encodeURIComponent(repo)}`}>{repo}</Link>;
};

const columns: GridColDef[] = [
  {
    field: "repo",
    headerName: "Repo",
    width: 200,
    renderCell: (params) => (
      <Linkweb href={GitHubURL + params.value} target="_blank">
        {params.value}
      </Linkweb>
    ),
  },
  {
    field: "stars",
    headerName: "Stars",
    width: 90,
    valueGetter: (val) => parseInt(val.row["stars"]),
  },
  {
    field: "days-last-star",
    headerName: "Days last star",
    width: 110,
    valueGetter: (params) => parseInt(params.value),
  },
  {
    field: "days-last-commit",
    headerName: "Days last commit",
    width: 130,
    valueGetter: (params) => parseInt(params.value),
  },
  {
    field: "new-stars-last-30d",
    headerName: "Stars last 30d",
    width: 110,
    valueGetter: (params) => parseInt(params.value),
  },
  {
    field: "new-stars-last-7d",
    headerName: "Stars last 7d",
    width: 110,
    valueGetter: (params) => parseInt(params.value),
  },
  {
    field: "stars-per-mille-30d",
    headerName: "New Stars 30d ‰",
    width: 130,
    valueGetter: (val) => parseFloat(val.row["stars-per-mille-30d"]),
  },
  {
    field: "mentionable-users",
    headerName: "Ment. users",
    width: 110,
    valueGetter: (params) => parseInt(params.value),
  },
  {
    field: "language",
    headerName: "Lang.",
    width: 110,
  },
  {
    field: "dependencies",
    headerName: "Direct deps",
    width: 130,
    valueGetter: (val) => parseInt(val.row["dependencies"]),
  },
  {
    field: "status",
    headerName: "Status",
    width: 110,
  },
  {
    field: "archived",
    headerName: "Archived",
    width: 110,
  },
  {
    headerName: "Starstimeline",
    width: 110,
    renderCell: (params) => <ShareableLink repo={params.row.repo} />,
  },
];

// https://raw.githubusercontent.com/emanuelef/awesome-go-repo-stats/main/analysis-latest.csv

let testTreeMapData = {
  name: "CNCF",
  color: "hsl(146, 70%, 50%)",
  children: [],
};

function App() {
  const fetchStats = () => {
    fetch(csvURL)
      .then((response) => response.text())
      .then((text) => Papa.parse(text, { header: true, skipEmptyLines: true }))
      .then(function (result) {
        setDataRows(result.data);
        console.log(result.data);

        testTreeMapData.children = [];

        result.data.forEach(
          (element: { status: string; repo: string; stars: string }) => {
            const catStatus = testTreeMapData.children.find(
              (category) => category.name === element.status
            );

            if (!element.repo) {
              return;
            }

            if (!catStatus) {
              testTreeMapData.children.push({
                name: element.status,
                children: [],
              });
            } else {
              catStatus.children.push({
                name: element.repo,
                stars: parseInt(element.stars),
              });
            }
          }
        );

        console.log(testTreeMapData);
        setTreeMapData(testTreeMapData);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
      });
  };

  const [dataRows, setDataRows] = useState([]);
  const [treeMapData, setTreeMapData] = useState({});
  const [selectedRepo, setSelectedRepo] = useState("kubernetes/kubernetes");
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const Table = () => {
    return (
      <div className="chart-container">
        <DataGrid
          getRowId={(row) => row.repo}
          rows={dataRows}
          columns={columns}
          rowHeight={30}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 50 },
            },
            sorting: {
              sortModel: [{ field: "stars-per-mille-30d", sort: "desc" }],
            },
          }}
          pageSizeOptions={[5, 10, 50]}
        />
      </div>
    );
  };

  const StarsTimeline = () => {
    const { id } = useParams();
    const decodedRepositoryId = decodeURIComponent(id);
    console.log(decodedRepositoryId);
    setSelectedRepo(decodedRepositoryId);
    return (
      <>
        <ShareableLink repo={selectedRepo} />
        <Autocomplete
          disablePortal
          id="combo-box-demo"
          options={dataRows.map((el) => {
            return { label: el.repo };
          })}
          sx={{ width: 300 }}
          renderInput={(params) => <TextField {...params} label="Repo" />}
          onChange={(e, v) => {
            console.log(v?.label);
            const encodedRepositoryId = encodeURIComponent(v?.label);
            console.log(encodedRepositoryId);
            setSelectedRepo(v?.label);
          }}
        />
        <TimeSeriesChart repo={selectedRepo} />
      </>
    );
  };

  const Treemap = () => {
    return (
      <div className="chart-container">
        <div style={{ height: 820, width: 1400, backgroundColor: "azure" }}>
          <ResponsiveTreeMap
            data={treeMapData}
            identity="name"
            value="stars"
            valueFormat=".03s"
            margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            labelSkipSize={12}
            labelTextColor={{
              from: "color",
              modifiers: [["darker", 1.2]],
            }}
            parentLabelPosition="top"
            parentLabelTextColor={{
              from: "color",
              modifiers: [["darker", 2]],
            }}
            borderColor={{
              from: "color",
              modifiers: [["darker", 0.1]],
            }}
            animate={false}
            tooltip={({ node }) => (
              <strong style={{ color: "black", backgroundColor: "white" }}>
                {node.pathComponents.join(" - ")}: {node.formattedValue}
              </strong>
            )}
            onClick={(data) => {
              window.open(GitHubURL + data.id, "_blank");
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar className="app" collapsed={collapsed}>
        <Menu>
          <MenuItem
            component={<Link to="/" className="link" />}
            className="menu1"
            icon={
              <MenuRoundedIcon
                onClick={() => {
                  setCollapsed(!collapsed);
                }}
              />
            }
          >
            <h2>CNCF Stats</h2>
          </MenuItem>
          <MenuItem
            component={<Link to="/table" className="link" />}
            icon={<TableViewRounded />}
          >
            Table
          </MenuItem>
          <MenuItem
            component={<Link to="/treemap" className="link" />}
            icon={<ViewQuiltRounded />}
          >
            Treemap
          </MenuItem>
          <MenuItem
            component={<Link to="/starstimeline/:id" className="link" />}
            icon={<TimelineRoundedIcon />}
          >
            StarsTimeline
          </MenuItem>
          <MenuItem
            component={<Link to="/deps" className="link" />}
            icon={<TableViewRounded />}
          >
            DepsChartTable
          </MenuItem>
          <MenuItem
            component={<Link to="/lang" className="link" />}
            icon={<BarChartRoundedIcon />}
          >
            Languages
          </MenuItem>
          <MenuItem
            component={<Link to="/langHC" className="link" />}
            icon={<BarChartRoundedIcon />}
          >
            Languages
          </MenuItem>
          <MenuItem
            component={<Link to="/k8sstarstimeline" className="link" />}
            icon={<TimelineRoundedIcon />}
          >
            K8s StarsTimeline
          </MenuItem>
        </Menu>
      </Sidebar>
      <section>
        <Routes>
          <Route path="/" element={<Table />} />
          <Route path="/table" element={<Table />} />
          <Route path="/treemap" element={<Treemap />} />
          <Route path="/starstimeline/:id" element={<StarsTimeline />} />
          <Route path="/k8sstarstimeline" element={<K8sTimeSeriesChart />} />
          <Route path="/deps" element={<DepsChart />} />
          <Route path="/lang" element={<LangBarChart dataRows={dataRows} />} />
          <Route
            path="/langHC"
            element={<LangHCBarChart dataRows={dataRows} />}
          />
        </Routes>
      </section>
    </div>
  );
}

export default App;
