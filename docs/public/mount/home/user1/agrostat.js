const React = window.platform.getService('React');

class StateMachine {
  constructor(states) {
    this._states = states;
    this._current_state = 0;
  }

  async execute(state) {
    if (this._current_state >= this._states.length) {
      console.log("Invalid state!");
      return undefined;
    }

    const { done, processedData, ...rest } = await this._states[this._current_state].execute(state);
    if (done) this._current_state++;

    return [rest, done && this._current_state === this._states.length, processedData];
  }
}

class Parser {
  constructor() {
    this._state = {
      form: {
        file_1: { type: 'file', label: 'Dataset' }
      },
      data: null,
      done: true
    };
  }

  async execute(state) {
    if (!state) return JSON.parse(JSON.stringify(this._state));

    const { data } = state;
    const form = JSON.parse(JSON.stringify(this._state.form)); // Deep copy

    return { data, form, done: true };
  }
}

class Downloader {
  constructor() {
    this._state = {
      data: null,
      done: false
    };
  }

  async execute(state) {
    if (!state) return JSON.parse(JSON.stringify(this._state));

    const { processedData = {} } = state;

    if (processedData) {
      try {
        const blob = new Blob([JSON.stringify(processedData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create download link and handle cleanup
        const downloadLink = this.createDownloadLink(url);

        return { data: downloadLink, done: true, form: {} };
      } catch (error) {
        return { data: null, done: false, error: error.message, form: {} };
      }
    }

    return { data: null, done: false, form: {} };
  }

  createDownloadLink(url) {
    return {
      url,
      download: 'results.json' // default filename
    };
  }
}

class Anova {
  constructor() {
    this._state = {
      form: {
        file_1: { type: 'file', label: 'Dataset', visible: true },
        variables: { type: 'multi-select', label: "Variables", options: [], visible: false } // Start with empty options and hidden
      },
      data: null,
      done: false
    };
  }

  async execute(state) {
    if (!state) return JSON.parse(JSON.stringify(this._state));

    const { data, formData = {} } = state; // Ensure formData is defined

    if (formData.file_1 && !this._state.form.variables.options.length) {
      const csvData = await this.parseCsvFile(formData.file_1);
      const headers = csvData[0]; // Assuming the first row contains headers
      this._state.form.variables.options = headers; // Update options with CSV headers
      this._state.form.variables.visible = true; // Show variables field after file is processed
    }

    const updatedForm = await this.checkRequiredFields(formData); // Validate and update form
    const form = JSON.parse(JSON.stringify(updatedForm)); // Deep copy

    if (this.isFormComplete(updatedForm)) {
      const processedData = await this.calculateAnova(formData); // Perform ANOVA calculation
      return { data, form: {}, done: true, processedData };
    }

    return { data, form, done: false };
  }

  async checkRequiredFields(formData) {
    let isComplete = true;
    const updatedForm = { ...this._state.form };

    // Example validation for 'variables' field
    if (!formData.variables || formData.variables.length === 0) {
      updatedForm.variables.validity = 'Please select at least one variable.';
      isComplete = false;
    } else {
      updatedForm.variables.validity = ''; // Reset validity
    }

    return updatedForm;
  }

  isFormComplete(formData) {
    // Check if all required fields are filled and valid (no validity messages)
    return Object.values(formData).every(field => !field.validity);
  }

  async calculateAnova(formData) {
    const file = formData.file_1;
    const variables = formData.variables;

    if (!file) {
      throw new Error("Dataset file is missing.");
    }

    // Parse CSV file asynchronously
    const csvData = await this.parseCsvFile(file);
    const headers = csvData[0]; // Get headers
    const rows = csvData.slice(1); // Get data rows

    // Extract data for selected variables
    const data = variables.reduce((acc, variable) => {
      const index = headers.indexOf(variable);
      if (index === -1) return acc; // Skip if variable not found in headers

      acc[variable] = rows.map(row => parseFloat(row[index])).filter(val => !isNaN(val));
      return acc;
    }, {});

    // Perform ANOVA calculations
    const results = this.performAnova(data, variables);

    return results;
  }

  performAnova(data, variables) {
    const results = {
      sumOfSquares: {},
      degreesOfFreedom: {},
      meanSquare: {},
      FValue: {},
      pValue: {},
    };

    const n = variables.length;
    const totalCount = Object.values(data)[0].length;
    
    // Calculate means for each variable
    const means = variables.reduce((acc, variable) => {
      const values = data[variable];
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      acc[variable] = mean;
      return acc;
    }, {});

    // Calculate total mean
    const totalMean = Object.values(data).flat().reduce((sum, value) => sum + value, 0) / totalCount;

    // Calculate Sum of Squares
    let ssBetween = 0, ssWithin = 0;

    variables.forEach(variable => {
      const values = data[variable];
      const mean = means[variable];
      ssBetween += values.length * Math.pow(mean - totalMean, 2);

      const ss = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0);
      ssWithin += ss;
    });

    results.sumOfSquares = {
      Between: ssBetween,
      Within: ssWithin,
      Total: ssBetween + ssWithin
    };

    // Degrees of Freedom
    results.degreesOfFreedom = {
      Between: n - 1,
      Within: totalCount - n,
      Total: totalCount - 1
    };

    // Mean Squares
    results.meanSquare = {
      Between: ssBetween / results.degreesOfFreedom.Between,
      Within: ssWithin / results.degreesOfFreedom.Within
    };

    // F-Value
    results.FValue = results.meanSquare.Between / results.meanSquare.Within;

    // p-Value (using a placeholder for simplicity)
    results.pValue = this.calculatePValue(results.FValue, results.degreesOfFreedom.Between, results.degreesOfFreedom.Within);

    return results;
  }

  calculatePValue(FValue, dfBetween, dfWithin) {
    // Placeholder for p-value calculation
    // In real implementation, use statistical libraries or APIs
    return 1 - Math.min(FValue / 10, 1); // Simplified and not accurate
  }

  async parseCsvFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const data = this.csvToArray(text);
        resolve(data);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  }

  csvToArray(text) {
    const rows = text.trim().split('\n');
    return rows.map(row => row.split(',').filter(x => x!=='\r' && x!==''));
  }
}

const stateMachine = new StateMachine([
  new Anova(),
  new Downloader()
]);

exports.stateMachine = stateMachine;

const DynamicForm = ({ formInput, formData, handleChange, showError }) => {
  const { form } = formInput;

  const renderInputField = (name, field) => {
    if (!field.visible) return null;
    
    switch (field.type) {
      case 'multi-select':
        return (
          <div key={name}>
            <label>{field.label}</label>
            <select
              multiple
              value={formData[name] || []}
              onChange={(e) =>
                handleChange(name, Array.from(e.target.selectedOptions, (option) => option.value))
              }
            >
              {field.options.map((option, index) => (
                <option key={index} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {showError && field.validity && <p className="error">{field.validity}</p>}
          </div>
        );
      case 'select':
        return (
          <div key={name}>
            <label>{field.label}</label>
            <select
              value={formData[name] || ''}
              onChange={(e) => handleChange(name, e.target.value)}
            >
              {field.options.map((option, index) => (
                <option key={index} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {showError && field.validity && <p className="error">{field.validity}</p>}
          </div>
        );
      case 'file':
        return (
          <div key={name}>
            <label>{field.label}</label>
            <input
              type="file"
              onChange={(e) => handleChange(name, e.target.files[0])}
            />
            {showError && field.validity && <p className="error">{field.validity}</p>}
          </div>
        );
      case 'string':
      default:
        return (
          <div key={name}>
            <label>{field.label}</label>
            <input
              type="text"
              value={formData[name] || ''}
              onChange={(e) => handleChange(name, e.target.value)}
            />
            {showError && field.validity && <p className="error">{field.validity}</p>}
          </div>
        );
    }
  };

  return (
    <form>
      {Object.keys(form).map((name) => renderInputField(name, form[name]))}
    </form>
  );
};

exports.App = (props) => {
  const [state, setState] = React.useState([null, false]);
  const [formData, setFormData] = React.useState({});
  const [showError, setShowError] = React.useState(false);

  const handleChange = (name, value) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: value
    }));
  };

  React.useEffect(() => {
    stateMachine.execute(null).then(result => setState(result));
  }, []);

  const next = async () => {
    if (state[1] === true) return;
    const result = await stateMachine.execute({ ...state[0], formData, processedData: state[2] });
    setState(result);
    setShowError(true); // Show error messages
    console.log(result);
  };

  const { data } = state[0] || {};
  const downloadLink = data ? data.url : '';

  return (
    <div>
      <DynamicForm
        formInput={state[0] || { form: {} }}
        formData={formData}
        handleChange={handleChange}
        showError={showError}
      />
      <button onClick={next}>Next</button>
      {downloadLink && (
        <a href={downloadLink} download="results.json">
          <button>Download Results</button>
        </a>
      )}
    </div>
  );
};
