import React from 'react';
import { Grid, Paper, Typography } from '@mui/material';
import { motion } from "framer-motion";

const ColouredBoxGrid = ({ number, title, color }) => {
  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        bgcolor: color,
        borderRadius: '10px',
        textAlign: 'center',
      }}
    >
      <Typography variant="h4">{number}</Typography>
      <Typography variant="subtitle1">{title}</Typography>
    </Paper>
  );
};

const ColouredBoxGridesGrid = ({ data }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
    <Grid container spacing={2}>
      {data.map((item, index) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
          <ColouredBoxGrid {...item} />
        </Grid>
      ))}
    </Grid>
    </motion.div>

  );
};

export default ColouredBoxGridesGrid;
