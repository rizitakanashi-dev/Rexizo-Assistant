import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0d0d0d', // Graphite Ink
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#5d5d5d', // Mid Ash
      contrastText: '#ffffff',
    },
    background: {
      default: '#ffffff', // Pure White
      paper: '#ffffff',
    },
    text: {
      primary: '#0d0d0d', // Graphite Ink
      secondary: '#5d5d5d', // Mid Ash
      disabled: '#8f8f8f', // Hollow
    },
    divider: 'rgba(0, 0, 0, 0.1)', // Hairline (#0000001a)
    // Semantic palettes kept achromatic per specification
    success: {
      main: '#0d0d0d',
      light: '#f9f9f9',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#5d5d5d',
      light: '#f9f9f9',
      contrastText: '#ffffff',
    },
    error: {
      main: '#0d0d0d',
      light: '#f9f9f9',
      contrastText: '#ffffff',
    },
    info: {
      main: '#5d5d5d',
      light: '#f9f9f9',
      contrastText: '#ffffff',
    },
    action: {
      hover: 'rgba(0, 0, 0, 0.05)', // Hover Veil (#0000000d)
      selected: 'rgba(0, 0, 0, 0.08)',
      disabled: '#8f8f8f',
      disabledBackground: 'rgba(0, 0, 0, 0.04)',
    },
  },
  shape: {
    borderRadius: 10,
  },
  shadows: Array(25).fill('none') as any, // System is flat by conviction; elevation from 1px hairline border only
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
    h1: { fontSize: '24px', fontWeight: 600, lineHeight: 1.33, color: '#0d0d0d' },
    h2: { fontSize: '24px', fontWeight: 600, lineHeight: 1.33, color: '#0d0d0d' },
    h3: { fontSize: '20px', fontWeight: 600, lineHeight: 1.33, color: '#0d0d0d' },
    h4: { fontSize: '18px', fontWeight: 600, lineHeight: 1.33, color: '#0d0d0d' },
    h5: { fontSize: '18px', fontWeight: 600, lineHeight: 1.33, color: '#0d0d0d' },
    h6: { fontSize: '16px', fontWeight: 600, lineHeight: 1.33, color: '#0d0d0d' },
    body1: { fontSize: '16px', fontWeight: 400, lineHeight: 1.5, color: '#0d0d0d' },
    body2: { fontSize: '14px', fontWeight: 400, lineHeight: 1.43, color: '#5d5d5d' },
    caption: { fontSize: '13px', fontWeight: 400, lineHeight: 1.43, color: '#8f8f8f' },
    button: { textTransform: 'none', fontWeight: 500, fontSize: '14px' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#ffffff',
          color: '#0d0d0d',
          letterSpacing: '0px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          border: '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: 'none',
          backgroundColor: '#ffffff',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: '16px',
          '&:last-child': {
            paddingBottom: '16px',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          backgroundImage: 'none',
          backgroundColor: '#ffffff',
        },
        outlined: {
          border: '1px solid rgba(0, 0, 0, 0.1)',
          borderRadius: 10,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          boxShadow: 'none',
          padding: '6px 12px',
          fontWeight: 500,
          fontSize: '14px',
          color: '#0d0d0d',
          '&:hover': {
            boxShadow: 'none',
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
        },
        contained: {
          backgroundColor: '#0d0d0d',
          color: '#ffffff',
          border: '1px solid #0d0d0d',
          '&:hover': {
            backgroundColor: '#000000',
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: 'rgba(0, 0, 0, 0.1)',
          color: '#0d0d0d',
          backgroundColor: '#ffffff',
          '&:hover': {
            borderColor: 'rgba(0, 0, 0, 0.2)',
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
        },
        text: {
          color: '#0d0d0d',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '6px 8px',
          color: '#0d0d0d',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 0, // Badges / Chips: 0px radius (square corners) per spec!
          fontSize: '12px',
          fontWeight: 500,
          height: '22px',
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          border: '1px solid rgba(0, 0, 0, 0.1)',
        },
        filled: {
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          border: '1px solid rgba(0, 0, 0, 0.1)',
        },
        outlined: {
          backgroundColor: 'transparent',
          color: '#0d0d0d',
          borderColor: 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#000000', // Ink Press
          color: '#ffffff',
          fontSize: '12px',
          borderRadius: 6,
          padding: '4px 8px',
        },
        arrow: {
          color: '#000000',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(0, 0, 0, 0.1)', // Hairline
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          border: '1px solid rgba(0, 0, 0, 0.1)',
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          boxShadow: 'none',
          padding: '8px 16px',
        },
        standardWarning: {
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          '& .MuiAlert-icon': {
            color: '#5d5d5d',
          },
        },
        standardError: {
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          '& .MuiAlert-icon': {
            color: '#0d0d0d',
          },
        },
        standardInfo: {
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          '& .MuiAlert-icon': {
            color: '#5d5d5d',
          },
        },
        standardSuccess: {
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          '& .MuiAlert-icon': {
            color: '#0d0d0d',
          },
        },
        filledWarning: {
          backgroundColor: '#f9f9f9',
          color: '#0d0d0d',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          '& .MuiAlert-icon': {
            color: '#5d5d5d',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: '#ffffff',
          color: '#0d0d0d',
          fontSize: '14px',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 0, 0, 0.1)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 0, 0, 0.2)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#0d0d0d',
            borderWidth: '1px',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid rgba(0, 0, 0, 0.1)',
          borderLeft: '1px solid rgba(0, 0, 0, 0.1)',
          backgroundColor: '#ffffff',
          boxShadow: 'none',
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)', // Deep Charcoal (#00000080)
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          padding: '6px',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '6px 10px',
          color: '#0d0d0d',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            fontWeight: 500,
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
            },
          },
        },
      },
    },
  },
})
