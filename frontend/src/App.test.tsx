import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { api } from './api/client';

// Mock the API client
jest.mock('./api/client', () => ({
  api: {
    listLeagues: jest.fn(),
    createLeague: jest.fn(),
    selectLeague: jest.fn(),
    getPlayers: jest.fn(),
    getCourts: jest.fn(),
    listRounds: jest.fn(),
    addPlayer: jest.fn(),
    addCourt: jest.fn(),
    generateRound: jest.fn(),
    getAssignments: jest.fn(),
  }
}));

describe('App Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the app header', async () => {
    (api.listLeagues as any).mockResolvedValue([]);
    
    render(<App />);
    
    expect(screen.getByText('Pickle Admin')).toBeInTheDocument();

    // Wait for async loadLeagues to settle
    await waitFor(() => {
      expect(api.listLeagues).toHaveBeenCalled();
    });
  });

  it('loads leagues on mount', async () => {
    const mockLeagues = [
      { id: '1', name: 'Summer League', createdAt: new Date(), updatedAt: new Date() }
    ];
    (api.listLeagues as any).mockResolvedValue(mockLeagues);
    
    render(<App />);
    
    await waitFor(() => {
      expect(api.listLeagues).toHaveBeenCalled();
    });
  });

  it('displays error banner when API call fails', async () => {
    (api.listLeagues as any).mockRejectedValue(new Error('Network error'));
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('shows league selector when leagues are loaded', async () => {
    const mockLeagues = [
      { id: '1', name: 'Summer League', createdAt: new Date(), updatedAt: new Date() }
    ];
    (api.listLeagues as any).mockResolvedValue(mockLeagues);
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('Your Sessions')).toBeInTheDocument();
    });
  });
});
